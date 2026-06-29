-- 0064 · Revoke EXECUTE de funciones SECURITY DEFINER que no deben ser RPC públicas
-- (spec 19 · DT-017)
--
-- Advisors: anon_security_definer_function_executable / authenticated_security_definer_function_executable.
-- Estas funciones quedaban llamables vía POST /rest/v1/rpc/<fn> por anon/authenticated porque tenían
-- grant a PUBLIC (línea `=X/postgres` en proacl) + grants explícitos a anon/authenticated.
--
-- Clasificación (ver design.md):
--   · Triggers           → el trigger corre dentro del motor, NO chequea EXECUTE del rol → revoke seguro.
--   · RPCs de negocio    → verificado: solo se invocan con service-role (server actions/webhooks).
--                          `increment_promo_use` se llama en persist-order.ts con createSupabaseServiceClient().
--                          Las otras 3 no aparecen en src (triggers o internas).
--   · Helpers de RLS     → is_business_member / is_platform_admin / is_group_owner: NO se tocan.
--                          Las policies los invocan bajo el rol que consulta → necesitan EXECUTE.
--
-- service_role conserva su grant explícito (`service_role=X/postgres`), así que el camino server-side
-- sigue intacto. Se revoca de PUBLIC además de anon/authenticated para cerrar el grant heredado.

-- ── Triggers ────────────────────────────────────────────────────────────
revoke execute on function public.log_order_status_change()            from public, anon, authenticated;
revoke execute on function public.log_order_initial_status()           from public, anon, authenticated;
revoke execute on function public.fn_stock_descuento_on_order_item()   from public, anon, authenticated;
revoke execute on function public.fn_recipe_stock_descuento()          from public, anon, authenticated;
revoke execute on function public.fn_recipe_stock_reversion()          from public, anon, authenticated;
revoke execute on function public.fn_ingredient_price_change_log()     from public, anon, authenticated;

-- ── RPCs de negocio (solo service-role las invoca) ───────────────────────
revoke execute on function public.increment_promo_use(uuid, uuid)      from public, anon, authenticated;
revoke execute on function public.mark_campaign_message_redeemed()     from public, anon, authenticated;
revoke execute on function public.ensure_default_super_categories()    from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                    from public, anon, authenticated;

-- Helpers de RLS (is_business_member / is_platform_admin / is_group_owner): intencionalmente SIN tocar.
