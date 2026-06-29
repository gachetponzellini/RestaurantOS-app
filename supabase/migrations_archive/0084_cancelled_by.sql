-- ═══════════════════════════════════════════════════════════════════════
-- 0084 — Quién anuló: cancelled_by en orders / order_items / invoices (spec 34)
--
-- Hoy las tres tablas guardan `cancelled_reason` (el MOTIVO) pero no QUIÉN
-- anuló. El resumen de cierre por email (spec 34) tiene que mostrar las
-- anulaciones del día con motivo + responsable, replicando el mail que MaxiRest
-- ya mandaba a los dueños.
--
-- `cancelled_by`: el usuario que disparó la anulación. Se captura en los
-- call-sites (anularMesa, cancelarItem, anularFactura, etc.) reusando el mismo
-- actor que el spec 27 ya pasa a las notificaciones (`actorUserId`).
--
-- Referencia a `auth.users` (no `public.users`): la mayoría de las anulaciones
-- son de staff, pero `cancelOrderByCustomer` las dispara un CLIENTE, que vive en
-- auth.users/customers y NO en public.users — un FK a public.users rompería ese
-- caso. El resumen resuelve el nombre del responsable joineando best-effort a
-- public.users (staff matchea por id; un cliente cae como "—"/genérico).
--
-- Aditivo, nullable, sin backfill: las anulaciones viejas quedan null → el mail
-- las muestra como "—". `on delete set null`: borrar un usuario no borra el
-- registro de la anulación. NO es un estado: la máquina de estados no cambia.
-- RLS heredada de cada tabla — no se tocan policies.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

alter table public.order_items
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

alter table public.invoices
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

comment on column public.orders.cancelled_by is
  'Spec 34: usuario que anuló la orden/mesa. Pareja con cancelled_reason. '
  'Null en anulaciones previas a la migración o sin actor → "—" en el resumen.';
comment on column public.order_items.cancelled_by is
  'Spec 34: usuario que anuló el ítem. Pareja con cancelled_reason. '
  'Null en anulaciones previas a la migración → "—" en el resumen.';
comment on column public.invoices.cancelled_by is
  'Spec 34: usuario que anuló el comprobante. Pareja con cancelled_reason. '
  'Null en anulaciones previas a la migración → "—" en el resumen.';
