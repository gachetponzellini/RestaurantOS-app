-- ============================================
-- Post-decisiones del 2026-05-07: roles MVP y estados de comanda
-- ============================================
-- Tras revisar los requerimientos originales del cliente
-- (raw/_requerimientos_text.md:131 — "Debe haber un rol de encargado de
-- cajas") y cerrar la decisión sobre cómo recibe la cocina los pedidos
-- (impresora térmica, no pantalla), reajustamos:
--
-- 1. Roles del MVP: 3 roles operativos. `staff` desaparece (era heredado
--    del Pilar 1 canal digital y no mapea a ninguna posición real del
--    local). Quien antes era `staff` pasa a `encargado_caja`.
--    `cocina` se elimina del check porque los cocineros no usan el sistema
--    en el MVP — reciben el ticket impreso. La pantalla `/cocina` sigue
--    existiendo en código (puede usar admin/encargado para monitoreo)
--    pero no se asigna a nadie ese rol.
--
-- 2. Comandas: estado `listo` desaparece. Flow simplificado:
--      pendiente       → recién creada, ticket todavía no impreso.
--      en_preparacion  → la impresión confirmó OK; cocina la tiene en mano.
--      entregado       → el mozo levantó el plato y lo llevó a la mesa.
--    `comandas.ready_at` se elimina (ya no hay momento "listo para retirar"
--    visible desde el sistema — eso lo manejan internamente en cocina).
--
-- Ver: wiki/decisiones/roles-mvp.md, wiki/decisiones/d3-cocina-impresion-termica.md
-- ============================================

-- ── 1. Roles ─────────────────────────────────────────────
-- Migrar data existente antes de cambiar el constraint.
update public.business_users set role = 'encargado_caja' where role = 'staff';

-- Si quedó alguno con role='cocina', lo dejamos huérfano: el negocio
-- decidirá si lo elimina o lo reasigna.
delete from public.business_users where role = 'cocina';

alter table public.business_users
  drop constraint if exists business_users_role_check;

alter table public.business_users
  add constraint business_users_role_check
  check (role in ('admin', 'encargado_caja', 'mozo'));

-- ── 2. Comandas: drop 'listo' y ready_at ─────────────────
update public.comandas set status = 'entregado' where status = 'listo';

alter table public.comandas
  drop constraint if exists comandas_status_check;

alter table public.comandas
  add constraint comandas_status_check
  check (status in ('pendiente', 'en_preparacion', 'entregado'));

alter table public.comandas drop column if exists ready_at;
