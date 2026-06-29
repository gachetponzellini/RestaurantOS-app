-- 0066 · Consolidar policies permisivas member+platform (spec 19 · DT-019)
--
-- Patrón uniforme verificado en estas 14 tablas: por cada comando hay exactamente 2 policies
-- PERMISSIVE para `authenticated` — una `member`/`admin` (is_business_member o un EXISTS sobre la tabla
-- padre) y una `platform` (is_platform_admin()). Postgres ya las combina con OR; acá hacemos ese OR
-- explícito en UNA policy por (tabla, comando) → set de filas idéntico (refactor seguro).
--
-- Ninguna de estas usa auth.uid() directo (van por helpers), así que no aplica DT-024 acá.
-- `caja_user_assignments` queda afuera (tiene una policy FOR ALL que rompe el patrón; lote aparte).
-- Solo se tocan grupos con >1 policy (los de 1 sola se dejan intactos).

do $$
declare
  t   text;
  c   text;
  rec record;
  using_expr text;
  check_expr text;
  tables text[] := array[
    'products','categories','super_categories','modifiers','modifier_groups','stations',
    'comandas','comanda_items','order_splits','order_split_items','order_status_history',
    'cajas','caja_movimientos','invoices'
  ];
begin
  foreach t in array tables loop
    foreach c in array array['SELECT','INSERT','UPDATE','DELETE'] loop

      -- solo consolidar si hay >1 policy permisiva de authenticated para ese comando
      if (select count(*) from pg_policies
            where schemaname='public' and tablename=t and cmd=c
              and permissive='PERMISSIVE' and array_to_string(roles,',')='authenticated') < 2 then
        continue;
      end if;

      -- OR de los predicados existentes (USING y WITH CHECK por separado)
      select
        string_agg(format('(%s)', qual),       ' or ') filter (where qual is not null),
        string_agg(format('(%s)', with_check), ' or ') filter (where with_check is not null)
      into using_expr, check_expr
      from pg_policies
      where schemaname='public' and tablename=t and cmd=c
        and permissive='PERMISSIVE' and array_to_string(roles,',')='authenticated';

      -- drop de las viejas
      for rec in
        select policyname from pg_policies
        where schemaname='public' and tablename=t and cmd=c
          and permissive='PERMISSIVE' and array_to_string(roles,',')='authenticated'
      loop
        execute format('drop policy %I on public.%I', rec.policyname, t);
      end loop;

      -- crear la consolidada
      execute format(
        'create policy %I on public.%I for %s to authenticated %s %s',
        t || '_' || lower(c), t, c,
        case when using_expr is not null then 'using (' || using_expr || ')' else '' end,
        case when check_expr is not null then 'with check (' || check_expr || ')' else '' end
      );

    end loop;
  end loop;
end $$;
