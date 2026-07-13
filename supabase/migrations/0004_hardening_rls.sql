-- ════════════════════════════════════════════════════════════════════════
-- 0004_hardening_rls — Spec 36 (hardening multi-tenancy y dinero)
--
-- Aditiva sobre el baseline. Cierra huecos de RLS detectados en la auditoría
-- wiki↔código (2026-07-13). No toca tablas ni columnas → database.types.ts
-- no cambia (no hace falta db:types).
--
--   R-B1  is_business_admin(bid): rol admin + activo (o platform admin).
--   R-B2  clock_allowed_origins: escritura solo admin (era cualquier miembro).
--   R-B3  is_business_member excluye empleados con disabled_at (baja lógica).
--   R-G3  mark_campaign_message_redeemed: el bump de redeemed_count solo cuenta
--         una redención por mensaje (antes sobre-contaba en códigos multi-uso).
--   R-E1  agenda el cron de auto-no_show (la función existía, nadie la corría).
-- ════════════════════════════════════════════════════════════════════════

-- ── R-B1 · helper admin ─────────────────────────────────────────────────
-- Espejo de is_business_staff pero solo admin. Se usa para config sensible
-- (allowlist de fichaje). Match del gate de app canManageBusiness (admin-only).
CREATE OR REPLACE FUNCTION "public"."is_business_admin"("bid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1 from public.business_users
    where business_id = bid
      and user_id = auth.uid()
      and role = 'admin'
      and disabled_at is null
  ) or public.is_platform_admin();
$$;

ALTER FUNCTION "public"."is_business_admin"("bid" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."is_business_admin"("bid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_business_admin"("bid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_admin"("bid" "uuid") TO "service_role";

-- ── R-B2 · clock_allowed_origins: escritura solo admin ───────────────────
-- Antes: is_business_member (cualquier mozo/personal borraba la allowlist del
-- fichaje on-site vía PostgREST → defeat de spec 11). Lectura queda por miembro
-- (ver la config no es el hueco; escribirla sí). El SELECT no cambia.
DROP POLICY IF EXISTS "clock_allowed_origins_insert" ON "public"."clock_allowed_origins";
CREATE POLICY "clock_allowed_origins_insert" ON "public"."clock_allowed_origins"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."is_business_admin"("business_id"));

DROP POLICY IF EXISTS "clock_allowed_origins_update" ON "public"."clock_allowed_origins";
CREATE POLICY "clock_allowed_origins_update" ON "public"."clock_allowed_origins"
  FOR UPDATE TO "authenticated"
  USING ("public"."is_business_admin"("business_id"))
  WITH CHECK ("public"."is_business_admin"("business_id"));

DROP POLICY IF EXISTS "clock_allowed_origins_delete" ON "public"."clock_allowed_origins";
CREATE POLICY "clock_allowed_origins_delete" ON "public"."clock_allowed_origins"
  FOR DELETE TO "authenticated"
  USING ("public"."is_business_admin"("business_id"));

-- ── R-B3 · is_business_member excluye bajas ──────────────────────────────
-- Antes: no filtraba disabled_at → un empleado dado de baja con sesión viva
-- seguía pasando el RLS de todas las tablas que usan este helper. Los reads del
-- panel admin usan service client (RLS bypass), así que el admin sigue viendo
-- a los deshabilitados; esto solo corta el acceso por JWT del propio ex-empleado.
CREATE OR REPLACE FUNCTION "public"."is_business_member"("bid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1 from public.business_users
    where business_id = bid
      and user_id = auth.uid()
      and disabled_at is null
  );
$$;

-- ── R-G3 · redención: contar una vez por mensaje ─────────────────────────
-- Antes: el bump de campaigns.redeemed_count seleccionaba TODOS los mensajes
-- que matcheaban promo+customer, sin filtrar redeemed_at, así que cada orden
-- nueva con un código personal multi-uso re-incrementaba el contador. Ahora
-- el bump solo cuenta los mensajes que ESTE trigger acaba de marcar redimidos.
CREATE OR REPLACE FUNCTION "public"."mark_campaign_message_redeemed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.promo_code_id is not null then
    with just_redeemed as (
      update public.campaign_messages
         set redeemed_at = now(),
             redeemed_order_id = NEW.id
       where promo_code_id = NEW.promo_code_id
         and customer_id = NEW.customer_id
         and redeemed_at is null
      returning campaign_id
    )
    update public.campaigns c
       set redeemed_count = redeemed_count + 1
      from (select distinct campaign_id from just_redeemed) jr
     where c.id = jr.campaign_id;
  end if;
  return NEW;
end;
$$;

-- ── R-C5 · incremento atómico de stock (evita lost update) ───────────────
-- ingresarStock/ajustarStock hacían read-modify-write en JS (leían current_qty
-- y lo reescribían) → un ingreso/venta concurrente pisaba la cantidad. Con esta
-- RPC el incremento es atómico en la DB. OJO: el código de stock/actions.ts
-- pasa a depender de esta función (deploy migración+código juntos, spec 36).
create or replace function public.adjust_stock_item(p_stock_item_id uuid, p_delta numeric)
returns numeric language sql security definer set search_path = public as $$
  update public.stock_items
     set current_qty = current_qty + p_delta,
         updated_at = now()
   where id = p_stock_item_id
  returning current_qty;
$$;
-- SOLO service_role: es SECURITY DEFINER y muta stock sin chequeo de tenant.
-- El código lo llama vía el service client (tras su propio gate). Supabase
-- concede EXECUTE a PUBLIC por default → hay que revocarlo explícitamente.
revoke all on function public.adjust_stock_item(uuid, numeric) from public, anon, authenticated;
grant execute on function public.adjust_stock_item(uuid, numeric) to service_role;

-- ── R-E1 · agendar auto-no_show ──────────────────────────────────────────
-- La función mark_overdue_reservations_no_show() existe (baseline) pero ningún
-- cron.schedule la agendaba → reservas confirmed vencidas nunca pasaban a
-- no_show y bloqueaban la mesa en el exclusion constraint indefinidamente.
-- cron.schedule es idempotente por jobname (reaplica sin duplicar).
select cron.schedule('reservations-no-show', '*/10 * * * *', $$ select public.mark_overdue_reservations_no_show(); $$);
