-- Spec 049 · Anular comanda entera por el encargado.
--
-- Aditiva: agrega el flag de anulación a nivel comanda. Cuando el encargado
-- anula una comanda completa, además de cancelar sus order_items (columnas ya
-- existentes: cancelled_at / cancelled_reason / cancelled_by), marcamos la
-- comanda misma. Ese flag:
--   1) distingue "comanda anulada entera" de "todos sus items cancelados de a
--      uno" (auditoría / futura vista de anuladas);
--   2) alimenta el ticket «ANULADA» que el print-agent reimprime — el GET de
--      /api/print-agent expone `cancelled` (aditivo) derivado de `cancelled_at`.
--
-- Sin cambios de RLS (las policies de `comandas` ya cubren estas columnas vía
-- orders.business_id) ni de la máquina de estados (anulación = flag lateral,
-- mismo criterio que reimpresión/fallo de impresión, specs 33/35).

alter table public.comandas
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null;

comment on column public.comandas.cancelled_at is
  'Spec 049: comanda anulada entera por encargado/admin. Sus order_items van cancelled_at; se reimprime un ticket ANULADA en la comandera del sector.';
comment on column public.comandas.cancelled_reason is
  'Spec 049: motivo de la anulación de la comanda (obligatorio en cancelarComanda).';
comment on column public.comandas.cancelled_by is
  'Spec 049: usuario (encargado/admin) que anuló la comanda.';
