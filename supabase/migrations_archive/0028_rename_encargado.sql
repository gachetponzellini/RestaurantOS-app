-- ============================================
-- Bloque 1 MVP · Rename `encargado_caja` → `encargado`.
--
-- En la práctica el rol opera salón, reservas y caja — no solo caja.
-- El nombre original ("encargado de cajas" en `raw/_requerimientos_text.md:131`)
-- describe una de sus funciones, no el alcance completo. Lo acortamos a
-- `encargado` para que matchee la jerga del local.
--
-- Migración mecánica:
--   1. Migrar data existente.
--   2. Reemplazar el check constraint.
--
-- Ver: wiki/decisiones/roles-mvp.md
-- ============================================

update public.business_users set role = 'encargado' where role = 'encargado_caja';

alter table public.business_users
  drop constraint if exists business_users_role_check;

alter table public.business_users
  add constraint business_users_role_check
  check (role in ('admin', 'encargado', 'mozo'));
