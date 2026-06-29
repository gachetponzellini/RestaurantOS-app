-- 0069 · Cierre de endurecimiento DB (spec 19 · DT-018 + DT-026 + DT-028)

-- ── DT-018 · Tablas de chatbot service-role-only ──────────────────────────
-- Verificado: las 4 tablas se acceden EXCLUSIVAMENTE vía createSupabaseServiceClient
-- (agent.ts, api/chatbot/*, reservations/chatbot-actions.ts, customers-query.ts, cart/[token]).
-- RLS on + sin policies = deniega anon/authenticated por diseño. Documentamos la intención para que
-- el advisor rls_enabled_no_policy (INFO) quede justificado y no se lea como un olvido.
comment on table public.chatbot_configs       is 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';
comment on table public.chatbot_contacts      is 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';
comment on table public.chatbot_conversations is 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';
comment on table public.chatbot_messages      is 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';

-- ── DT-026 · Buckets públicos sin listado ─────────────────────────────────
-- `products` y `floor-plans` son public=true → las imágenes se sirven por CDN con getPublicUrl(),
-- que NO requiere policy SELECT sobre storage.objects. La policy amplia `public_read_*` solo habilitaba
-- enumerar (.list()) todo el bucket — la app nunca lista (verificado). Se elimina.
-- Las policies de INSERT/UPDATE/DELETE (admin + platform, scopeadas por business_id en el prefijo) quedan.
drop policy if exists public_read_products    on storage.objects;
drop policy if exists public_read_floor_plans on storage.objects;

-- ── DT-028 · btree_gist fuera del schema public ───────────────────────────
-- Único dependiente: el exclusion constraint reservations_no_overlap (referencia operadores por OID,
-- así que mover el schema de la extensión no lo rompe).
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- Nota (no-SQL): activar "Leaked password protection" (HaveIBeenPwned) en Supabase Dashboard →
-- Authentication → Settings. Es un toggle, no una migración (DT-028, parte Auth).
