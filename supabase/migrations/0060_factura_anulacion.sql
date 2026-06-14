-- =============================================================
-- 0060 — Anulación de factura: motivo + link a nota de crédito
--
-- Cambio 09 (pedido flash + anulación de factura). En AR "anular" un
-- comprobante autorizado se hace EMITIENDO una nota de crédito; la
-- factura original NO se borra, queda en status='cancelled'. Acá
-- agregamos la trazabilidad de esa operación:
--   1. `cancelled_reason`: motivo obligatorio de la anulación,
--      persistido en la factura original.
--   2. `cancels_invoice_id`: cuando la fila ES la nota de crédito,
--      apunta a la factura que anula (link NC → factura).
--
-- El pedido flash NO necesita tablas nuevas: usa orders/order_items
-- con product_id null (soportado desde 0020_soften_product_fks.sql).
--
-- RLS: reusa las policies de `invoices` de 0048 (members_update ya
-- permite a encargado/admin marcar cancelled).
--
-- Ver: wiki/specs/09-pedido-flash-y-anulacion-factura/
-- =============================================================

alter table public.invoices
  add column if not exists cancelled_reason text,
  add column if not exists cancels_invoice_id uuid
    references public.invoices(id) on delete set null;

create index if not exists invoices_cancels_idx
  on public.invoices (cancels_invoice_id)
  where cancels_invoice_id is not null;

comment on column public.invoices.cancelled_reason is 'Motivo de anulación (obligatorio al anular un comprobante autorizado vía nota de crédito)';
comment on column public.invoices.cancels_invoice_id is 'Si la fila es una nota de crédito, apunta a la factura original que anula';
