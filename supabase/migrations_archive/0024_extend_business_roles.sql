-- ============================================
-- Extender business_users.role para roles operativos
-- ============================================
-- Hasta acá teníamos solo `admin` (manage) y `staff` (operate).
-- Con mozo + cocina como features del producto, agregamos los roles
-- correspondientes para que el invite form en /admin/usuarios pueda
-- diferenciar quién entra a cada panel.
--
-- Jerarquía:
--   admin   → manage del negocio + acceso a todo
--   staff   → operativo general (pedidos en vivo, sin manage)
--   mozo    → solo /[slug]/mozo (plano de mesas, reservas, alta de pedidos)
--   cocina  → solo /[slug]/cocina (kanban de comandas)

alter table public.business_users
  drop constraint if exists business_users_role_check;

alter table public.business_users
  add constraint business_users_role_check
  check (role in ('admin', 'staff', 'mozo', 'cocina'));
