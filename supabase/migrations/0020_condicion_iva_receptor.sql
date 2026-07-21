-- Spec 053 · Condición de IVA del receptor (R-C6 del issue #51).
--
-- Aditiva: persiste la condición de IVA declarada del receptor (RG 5616) en el
-- comprobante. Hasta ahora la condición se derivaba SOLO del tipo (A→RI, B→CF)
-- en `gateway-payload.condicionIvaFor`, lo que declararía mal a un Monotributista
-- (Factura B con CUIT → Consumidor Final; Factura A → RI). Con esta columna la
-- condición viaja como dato y sobrevive a los flujos que reconstruyen el request
-- desde la fila: `retryInvoice` y `anularFactura` (la NC hereda la condición).
--
-- NULL = "no declarada explícitamente" → el código cae al default histórico por
-- tipo. Por eso las filas viejas y el camino feliz (B a consumidor final sin
-- CUIT) no cambian de comportamiento.
--
-- Sin cambios de RLS: `invoices` se escribe siempre por el service client desde
-- `src/lib/afip/emit-invoice.ts`; esta columna es un dato fiscal no sensible
-- (no es un secreto), así que las policies de SELECT existentes la cubren.

alter table public.invoices
  add column if not exists condicion_iva_receptor smallint;

comment on column public.invoices.condicion_iva_receptor is
  'Condición IVA del receptor (RG 5616): 1=Responsable Inscripto, 4=Exento, 5=Consumidor Final, 6=Monotributo. NULL = no declarada → default histórico por tipo (A→1, B→5). Ver spec 053.';

alter table public.invoices
  drop constraint if exists invoices_condicion_iva_receptor_check;

alter table public.invoices
  add constraint invoices_condicion_iva_receptor_check
  check (condicion_iva_receptor is null or condicion_iva_receptor in (1, 4, 5, 6));
