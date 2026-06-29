-- ============================================
-- Bloque 1 MVP · Soft-delete de empleados + datos opcionales por membership.
--
-- - `disabled_at`: soft-delete. Login/acceso al panel quedan bloqueados cuando
--   no es null; el histórico (orders.mozo_id, comandas.created_by, etc.) se
--   preserva intacto.
-- - `full_name` y `phone`: dato por-membership. Permite que un mismo usuario
--   tenga distinto nombre de visualización por business (ej: una persona que
--   trabaja en dos locales del cliente).
-- - Índice parcial `business_users_active_idx`: optimiza la query default
--   `listBusinessMembers(businessId)` que filtra `disabled_at is null`.
--
-- Ver: wiki/casos-de-uso/CU-12-alta-empleado.md (D-CU12-2)
-- ============================================

alter table public.business_users
  add column if not exists disabled_at timestamptz,
  add column if not exists full_name text,
  add column if not exists phone text;

create index if not exists business_users_active_idx
  on public.business_users (business_id)
  where disabled_at is null;
