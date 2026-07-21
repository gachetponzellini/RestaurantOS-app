# Plan de implementación — 053 Condición de IVA del receptor (B con CUIT + fix hardcode)

**Spec**: [`spec.md`](./spec.md) · **Issue**: [#51](https://github.com/gachetponzellini/RestaurantOS-app/issues/51) (R-C6) · **Migración**: `0020` (siguiente libre — 0017/0018/0019 ya existen; **verificar el máximo antes de crear**, hay sesiones paralelas sobre este working tree)

## Estrategia: un campo opcional que atraviesa las 3 capas y se persiste

El bug es un default hardcodeado (`condicionIvaFor` mira solo el `tipo`). El fix es hacer la condición un **dato de primera clase**: entra por la UI, viaja en `InvoiceRequest`, se **guarda en `invoices`**, y el gateway-payload la usa cuando está, cayendo al default histórico cuando es NULL. Persistir es obligatorio porque retry y anulación reconstruyen desde la fila, no desde el input.

## Cambio central — `gateway-payload.ts`

`condicionIvaFor(tipo)` pasa a recibir la condición explícita:

```ts
// ANTES (src/lib/afip/gateway-payload.ts:42-44)
function condicionIvaFor(tipo: TipoComprobante): CondicionIvaReceptor {
  return isTipoA(tipo) ? 1 : 5;
}

// DESPUÉS
function condicionIvaFor(
  tipo: TipoComprobante,
  explicit?: CondicionIvaReceptor | null,
): CondicionIvaReceptor {
  if (explicit) return explicit;      // condición declarada gana
  return isTipoA(tipo) ? 1 : 5;       // fallback histórico: sin CUIT / filas viejas
}
```

Y el caller dentro de `buildGatewayPayload` (`gateway-payload.ts:82`) pasa `req.condicionIvaReceptor`. Función **pura** — el test es directo (`gateway-payload.test.ts` ya existe como molde).

## Tipos — `types.ts`

- `InvoiceRequest` (`types.ts:51`): agregar `condicionIvaReceptor?: CondicionIvaReceptor`.
- `CondicionIvaReceptor` (`types.ts:42`): **no se toca** (ya es `1|4|5|6`).

## Server action — `emit-invoice.ts`

`EmitInput` (`emit-invoice.ts:36`): agregar `condicionIvaReceptor?: CondicionIvaReceptor`. Validar en el borde con Zod (enum `[1,4,5,6]`).

Cuatro cambios en el flujo:

1. **Quitar el blindaje interino** (`emit-invoice.ts:186-190`) — el rechazo de "B con CUIT no soportado" desaparece.
2. **Nuevo guard**: si `(tipo B o NC-B) && cuitReceptor && !condicionIvaReceptor` → `actionError("Elegí la condición de IVA del receptor para una Factura B con CUIT.")`. (Reemplaza al blindaje: antes prohibía el combo; ahora lo exige bien formado.)
3. **Persistir en la reserva** (`emit-invoice.ts:220-238`, el `.insert`): agregar `condicion_iva_receptor: input.condicionIvaReceptor ?? null`.
4. **Pasar al enqueue** (`emit-invoice.ts:269-280`): agregar `condicionIvaReceptor: input.condicionIvaReceptor`.

Retry y anulación (leen de la fila):

5. **`retryInvoice`** (`emit-invoice.ts:~487-495`): en el `enqueue`, agregar `condicionIvaReceptor: inv.condicion_iva_receptor ?? undefined`.
6. **`anularFactura`** (`emit-invoice.ts:~638-648`): en el `enqueue` de la NC, agregar `condicionIvaReceptor: original.condicion_iva_receptor ?? undefined`.

## Migración `0020_condicion_iva_receptor.sql`

```sql
alter table public.invoices
  add column if not exists condicion_iva_receptor smallint;

comment on column public.invoices.condicion_iva_receptor is
  'Condición IVA del receptor (RG 5616): 1=RI, 4=Exento, 5=Consumidor Final, 6=Monotributo. NULL = default histórico por tipo (A→1, B→5).';

-- Opcional (defensa): CHECK del dominio.
alter table public.invoices
  add constraint invoices_condicion_iva_receptor_check
  check (condicion_iva_receptor is null or condicion_iva_receptor in (1,4,5,6));
```

- **No** requiere cambios de RLS: `invoices` ya es service-role-only para escritura (todas las emisiones pasan por el service client en `emit-invoice.ts`). Confirmar que la policy de SELECT existente no filtra por columnas (no expone secretos — es una columna fiscal no sensible).
- Aplicar al cloud (`tjfufswzsxfujcpoxapx`) vía MCP de Supabase (`apply_migration`). Regenerar tipos (`pnpm db:types`) → aparece `condicion_iva_receptor` en `database.types.ts`.

## UI — selector de condición cuando hay CUIT

### `cobrar-client.tsx` (cobro de mesa, caller principal)

Estado actual (`cobrar-client.tsx:937-968`): toggle `tipoA` (A vs B) + input `cuit` (solo visible en A). Cambios:

- Nuevo estado `condicionIva: CondicionIvaReceptor | null`.
- Mostrar un **selector** (RI / Monotributo / Exento / Consumidor Final) **cuando hay CUIT cargado** (hoy solo en A; con esta spec, también si se habilita CUIT en B — ver decisión de producto sobre habilitar el input de CUIT en B).
- Default del selector: **1 (RI)** en A, **6 (Monotributo)** en B con CUIT.
- Pasar `condicionIvaReceptor: cuit ? condicionIva : undefined` al `emitInvoice` (`cobrar-client.tsx:953-959`).
- Al desactivar A / borrar CUIT: resetear `condicionIva` a null (evitar valor pegado — ver Edge Cases).

> Nota: habilitar el **input de CUIT en tipo B** es parte de esta feature (hoy `cobrar-client.tsx:956` solo manda CUIT en A). El selector de condición es lo que hace segura esa habilitación.

### `pedido-flash-dialog.tsx` (`:70`) e `invoice-detail-sheet.tsx` (`:115`)

Mismos callers de `emitInvoice`. Agregar el selector de condición cuando el flujo capture CUIT, y pasar `condicionIvaReceptor`. Si un caller nunca maneja CUIT, no necesita el selector pero **debe seguir compilando** con el campo opcional.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `supabase/migrations/0020_condicion_iva_receptor.sql` | **nuevo** — columna `condicion_iva_receptor` + CHECK |
| `src/lib/afip/types.ts` | `InvoiceRequest.condicionIvaReceptor?` |
| `src/lib/afip/gateway-payload.ts` | `condicionIvaFor(tipo, explicit)` + caller |
| `src/lib/afip/emit-invoice.ts` | `EmitInput` + Zod; quitar blindaje `186-190`; nuevo guard; persistir en insert; pasar en enqueue (emisión/retry/anulación) |
| `src/app/[business_slug]/mozo/mesa/[id]/cobrar/cobrar-client.tsx` | selector de condición + habilitar CUIT en B + pasar campo |
| `src/components/admin/facturacion/pedido-flash-dialog.tsx` | selector + pasar campo |
| `src/components/admin/facturacion/invoice-detail-sheet.tsx` | selector + pasar campo |
| `src/lib/supabase/database.types.ts` | regenerar (`pnpm db:types`) |

## Riesgo y compatibilidad

- **Retrocompat total**: campo opcional + fallback histórico. Cobros sin CUIT y filas viejas se comportan idéntico. El test de integración existente (`emit-invoice.integration.test.ts`, camino B a consumidor final) debe seguir **verde sin tocarlo** (regresión-guard).
- **Superficie fiscal**: es plata/fiscal → TDD estricto, tests primero, y **verify en vivo** con emisión real (sandbox del gateway) antes de cerrar #51.

## Gates SDD

Dispara **plan.md obligatorio** (toca facturación fiscal / ARCA, cruza UI de cobro + módulo afip + migración). TDD estricto: la lógica de `condicionIvaFor` y el guard de emisión arrancan con test rojo.
