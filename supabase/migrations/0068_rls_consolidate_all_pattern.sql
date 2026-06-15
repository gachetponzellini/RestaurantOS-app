-- 0068 · Consolidar policies permisivas — patrón platform_all + member (spec 19 · DT-019)
--
-- Cierra el resto de multiple_permissive_policies. Muchas tablas tienen una policy `platform_all_*`
-- (FOR ALL = is_platform_admin) que se solapa con las `member_*` por-comando → el advisor cuenta 2-3
-- policies permisivas por comando efectivo. Para llegar a 1 por comando hay que ELIMINAR la policy ALL
-- y plegar el predicado platform dentro de cada policy por-comando.
--
-- Transformación (equivalencia-preservante): para cada comando efectivo C de cada tabla, la nueva policy
-- combina con OR los predicados de TODAS las policies aplicables (las de cmd=C + la de cmd=ALL):
--   · USING  = OR de los `qual` aplicables (la ALL aporta su qual; INSERT no lleva USING).
--   · CHECK  = OR de los `with_check` EFECTIVOS: para policies UPDATE/ALL, si with_check es NULL,
--              Postgres usa el USING como check → acá usamos coalesce(with_check, qual). Para INSERT,
--              with_check explícito. (Sin este coalesce, los UPDATE con with_check NULL se romperían.)
-- Resultado: 1 policy permisiva por (tabla, comando). El acceso (filas visibles / writes permitidos) es
-- idéntico al previo. auth.uid() ya viene envuelto desde 0067 (business_groups.owner).
--
-- Se calcula la lista de CREATE ANTES de dropear (lee el estado viejo), luego dropea las permisivas de
-- `authenticated` de estas tablas, luego crea las consolidadas. Las policies de otros roles (anon/public)
-- NO se tocan.

do $$
declare
  tbls text[] := array[
    'business_hours','business_users','businesses','customer_addresses','notifications','tables_audit_log',
    'business_group_members','business_groups','caja_user_assignments','clock_allowed_origins','clock_blocked_attempts',
    'delivery_message_templates','ingredient_consumptions','ingredient_presentations','ingredient_price_log',
    'ingredient_recipes','ingredients','mozo_rendiciones','notification_preferences','payment_method_configs',
    'recipes','stock_items','stock_movimientos','supplier_ingredients','supplier_invoices','suppliers',
    'whatsapp_credentials','whatsapp_outbox'
  ];
  stmts text[];
  s text;
  r record;
begin
  -- 1) calcular los CREATE consolidados desde el estado ACTUAL (viejo)
  select array_agg(
           format('create policy %I on public.%I for %s to authenticated %s %s',
                  agg.tablename || '_' || lower(agg.eff_cmd), agg.tablename, agg.eff_cmd,
                  coalesce('using (' || agg.using_expr || ')', ''),
                  coalesce('with check (' || agg.check_expr || ')', '')))
    into stmts
  from (
    select app.tablename, app.eff_cmd,
      string_agg(format('(%s)', app.eff_using), ' or ')
        filter (where app.eff_cmd <> 'INSERT' and app.eff_using is not null) as using_expr,
      string_agg(format('(%s)', app.eff_check), ' or ')
        filter (where app.eff_cmd in ('INSERT','UPDATE') and app.eff_check is not null) as check_expr
    from (
      select pol.tablename, ec.eff_cmd,
        case when pol.cmd='INSERT' then null else pol.qual end as eff_using,
        case when pol.cmd in ('UPDATE','ALL') then coalesce(pol.with_check, pol.qual)
             when pol.cmd='INSERT' then pol.with_check else null end as eff_check
      from pg_policies pol
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) as ec(eff_cmd)
      where pol.schemaname='public' and pol.permissive='PERMISSIVE'
        and array_to_string(pol.roles,',')='authenticated'
        and pol.tablename = any(tbls)
        and (pol.cmd = ec.eff_cmd or pol.cmd='ALL')
    ) app
    group by app.tablename, app.eff_cmd
  ) agg;

  -- 2) dropear las permisivas de authenticated de estas tablas
  for r in
    select policyname, tablename from pg_policies
    where schemaname='public' and permissive='PERMISSIVE'
      and array_to_string(roles,',')='authenticated'
      and tablename = any(tbls)
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  -- 3) crear las consolidadas
  foreach s in array stmts loop
    execute s;
  end loop;
end $$;
