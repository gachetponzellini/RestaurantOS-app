# Feature Specification: Condición de IVA real del receptor (Factura B con CUIT + fix hardcode)

**Feature Branch**: `053-condicion-iva-receptor`

**Created**: 2026-07-21

**Status**: Especificado (2026-07-21). Pendiente: `plan.md` aprobado → TDD. Issue [#51](https://github.com/gachetponzellini/RestaurantOS-app/issues/51) (bloque 36C · R-C6). Milestone: Post-demo · Growth & hardening.

**Input**: Cierre del último ítem abierto del issue #51 (36C · bugs de dinero/fiscal). R-C6 quedó DIFERIDO con blindaje interino; esta spec lo implementa de verdad. Decisión de Juan 2026-07-21: "dejalo abierto, y generemos una spec para corregirla; una vez resuelto la cerramos".

## Contexto y problema

Al emitir un comprobante contra ARCA (vía el ARCA GPSF Gateway) hay que declarar la **condición de IVA del receptor** (RG 5616): Responsable Inscripto, Monotributo, Exento o Consumidor Final. Hoy el sistema **no la captura ni la modela**: la deriva mecánicamente del tipo de comprobante.

```ts
// src/lib/afip/gateway-payload.ts:42-44
function condicionIvaFor(tipo: TipoComprobante): CondicionIvaReceptor {
  return isTipoA(tipo) ? 1 : 5;   // A → Responsable Inscripto, B → Consumidor Final
}
```

Esto encierra **dos defectos fiscales latentes**:

1. **Factura B con CUIT identificado (R-C6, el que dispara esta spec).** Si se emitiera una Factura/NC **B** a un receptor identificado por CUIT (`doc_tipo=80`) — típicamente un **Monotributista** o **Exento** —, el sistema lo declararía como **Consumidor Final (5)**, inconsistente con un receptor identificado y una **mala declaración ante ARCA**.
2. **Nota espejo — Factura A a un Monotributista.** `A → 1` está igual de hardcodeado: una Factura A a un Monotributista se declararía **Responsable Inscripto (1)** en vez de **Monotributo (6)**. Misma causa raíz, se cubre en el mismo cambio.

### Por qué hoy NO es un defecto en vivo (y por qué igual hay que arreglarlo)

Ningún path de UI produce hoy el combo peligroso: el mozo solo captura CUIT en **tipo A** (`cobrar-client.tsx:937,956` — el toggle `tipoA` es lo único que habilita el input de CUIT), y admin/pedido-flash no pasan CUIT en B. El caso dominante de golf-house (**B a consumidor final sin CUIT**, **A a empresa RI**) se emite **correcto**.

Además ya está puesto un **blindaje interino** que cierra el agujero por ahora rechazando el combo:

```ts
// src/lib/afip/emit-invoice.ts:186-190  (a REMOVER cuando esta spec entre)
if ((tipo === "factura_b" || tipo === "nota_credito_b") && input.cuitReceptor) {
  return actionError(
    "Comprobante B con CUIT todavía no está soportado (falta capturar la condición de IVA del receptor).",
  );
}
```

Resultado: el gap es **latente, no un fraude fiscal activo**. Esta spec lo convierte en soporte real y quita el candado.

### El dato viaja por tres capas y sobrevive a retry/anular

El request al provider se arma en **tres lugares distintos**, y dos de ellos **reconstruyen desde la fila `invoices`**, no desde el input original:

| Origen del `enqueue` | Archivo:línea | De dónde saca los datos del receptor |
|---|---|---|
| Emisión nueva | `emit-invoice.ts:269-280` | del `EmitInput` (UI) |
| **Retry** de una `failed`/`pending` | `emit-invoice.ts:~487-495` | **de la fila `invoices`** (`inv.cuit_receptor`) |
| **Anulación** (nota de crédito espejo) | `emit-invoice.ts:~638-648` | **de la fila `invoices`** (`original.cuit_receptor`) |

Consecuencia dura: la condición de IVA **debe persistirse en la fila `invoices`**, o el retry y la nota de crédito volverían a caer en el default hardcodeado y re-introducirían el bug. Hoy la tabla tiene `cuit_receptor` y `razon_social_receptor` (`0001_baseline.sql:1256-1257`) pero **no** `condicion_iva_receptor`.

## Alcance

### SÍ incluye

- **Modelar la condición de IVA del receptor** de punta a punta: `EmitInput` → `InvoiceRequest` → payload del gateway, y **persistida en `invoices.condicion_iva_receptor`**.
- **Habilitar Factura/NC B con CUIT**: quitar el blindaje interino (`emit-invoice.ts:186-190`) y, en su lugar, **exigir** la condición cuando hay CUIT en una B.
- **Fix del hardcode A→1**: cuando se identifica al receptor con CUIT en tipo A, usar la condición declarada (RI/Monotributo/Exento), no `1` fijo.
- **Selector en la UI de cobro** (RI / Monotributo / Exento / Consumidor Final) que aparece cuando hay CUIT, en los tres callers (`cobrar-client.tsx`, `pedido-flash-dialog.tsx`, `invoice-detail-sheet.tsx`).
- **Retry y anulación** re-encolan con la condición persistida (no re-derivada).
- **Default preservado**: sin CUIT → Consumidor Final (5), como hoy. Cero cambio en el camino feliz de golf-house.

### NO incluye (descartado / fuera de alcance)

- **Validación online de la condición contra el padrón de ARCA** (constatar que el CUIT X es realmente Monotributista). Se confía en lo que declara el operador, igual que hoy con el CUIT. Se puede sumar después.
- **Percepciones/retenciones por condición** (IIBB, etc.). Fuera de alcance fiscal de esta spec.
- **Cambiar el CUIT emisor o el punto de venta.** El emisor lo fija la API key del gateway (ver `types.ts` `GatewayCredentials`); no se toca.
- **Migración retroactiva de facturas ya emitidas.** Las filas viejas quedan con `condicion_iva_receptor = NULL` y se interpretan con el default histórico (ver Edge Cases).

## Decisiones de producto

| Decisión | Resolución | Motivo |
|---|---|---|
| **Cuándo se pide la condición** | Solo cuando hay **CUIT** (receptor identificado). Sin CUIT → Consumidor Final automático, sin preguntar. | No agregar fricción al 95% de los cobros (consumidor final sin identificar). "Cero fricción en hora pico". |
| **Valores del selector** | RI (1) · Exento (4) · Consumidor Final (5) · Monotributo (6) | Los cuatro de `CondicionIvaReceptor` (`types.ts:42`), RG 5616. |
| **Default del selector con CUIT** | **Responsable Inscripto (1)** para tipo A; **Monotributo (6)** para tipo B con CUIT | En A el receptor identificado casi siempre es RI; en B con CUIT el caso típico es Monotributo. Editable siempre. |
| **B con CUIT sin condición elegida** | **Rechazo** (no default silencioso) | Es el defecto que estamos cerrando: nunca declarar CF para un receptor identificado sin decisión explícita. |
| **Permiso** | El mismo que ya gatea emitir (mozo cobra tipo A/B; `canCrearPedidoFlash`/`canAnularFactura` para flash/anulación) | No introduce un permiso nuevo; solo agrega un campo al flujo existente. |
| **Persistencia** | Columna nueva `invoices.condicion_iva_receptor smallint NULL` | Retry y anulación reconstruyen desde la fila; sin persistir, volvería el bug. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Factura B a un Monotributista con CUIT (Priority: P1)

Como **encargado/mozo**, cuando le facturo a un cliente Monotributista que me pasa su CUIT y quiere Factura B, elijo tipo B, cargo el CUIT, selecciono "Monotributo" en el nuevo selector y emito. El comprobante se declara ante ARCA con condición **Monotributo (6)**, no Consumidor Final.

**Why this priority**: Es exactamente el defecto fiscal que abre el issue #51 (R-C6). Sin esto, o se rechaza (blindaje actual) o se declara mal.

**Independent Test**: `emitInvoice({ tipoComprobante: 'factura_b', cuitReceptor: <cuit>, condicionIvaReceptor: 6 })` → la fila `invoices` guarda `condicion_iva_receptor=6` y el payload al gateway lleva `condicion_iva=6` (assert sobre `buildGatewayPayload`/mock del provider).

**Acceptance Scenarios**:

1. **Dado** tipo B + CUIT + condición Monotributo, **Cuando** emito, **Entonces** el payload lleva `condicion_iva=6`, `doc_tipo=80`, `doc_nro=<cuit>`, y `invoices.condicion_iva_receptor=6`.
2. **Dado** tipo B + CUIT **sin** condición seleccionada, **Cuando** intento emitir, **Entonces** rechazo con mensaje claro ("Elegí la condición de IVA del receptor"), cero emisión.
3. **Dado** tipo B **sin** CUIT, **Cuando** emito, **Entonces** `condicion_iva=5` (Consumidor Final), `doc_tipo=99`, `condicion_iva_receptor` persistida como 5 o NULL (default), **idéntico a hoy**.

---

### User Story 2 - Factura A a un Monotributista (fix del hardcode espejo) (Priority: P2)

Como **encargado**, si emito Factura A a un cliente Monotributista, la condición declarada debe ser **Monotributo (6)**, no Responsable Inscripto fijo.

**Why this priority**: Mismo defecto de raíz (`condicionIvaFor` hardcodea A→1). Barato de cubrir en el mismo cambio; evita una mala declaración simétrica.

**Independent Test**: `emitInvoice({ tipoComprobante: 'factura_a', cuitReceptor: <cuit>, condicionIvaReceptor: 6 })` → payload con `condicion_iva=6`. Con `condicionIvaReceptor` ausente → default RI (1), comportamiento histórico preservado.

**Acceptance Scenarios**:

1. **Dado** tipo A + condición Monotributo, **Cuando** emito, **Entonces** `condicion_iva=6` (no 1).
2. **Dado** tipo A sin condición explícita (retrocompat), **Cuando** emito, **Entonces** `condicion_iva=1` (default histórico), sin romper los cobros A actuales.

---

### User Story 3 - Retry y anulación conservan la condición (Priority: P1 — integridad)

Como **sistema**, cuando reintento una factura B-con-CUIT que falló, o cuando emito su nota de crédito, la condición de IVA declarada debe ser **la misma** que la del comprobante original — no re-derivada del tipo.

**Why this priority**: `retryInvoice` y `anularFactura` reconstruyen el request desde la fila `invoices` (`emit-invoice.ts:~490` y `~640`). Si no persistimos y leemos la condición, el retry/NC re-introduce el bug justo en el peor momento (comprobante fiscal real).

**Independent Test**: Emitir B+CUIT+Monotributo → forzar `failed` → `retryInvoice` → el segundo `enqueue` lleva `condicion_iva=6`. Idem `anularFactura` → la NC-B espejo lleva `condicion_iva=6`.

**Acceptance Scenarios**:

1. **Dado** una `invoices` con `condicion_iva_receptor=6`, **Cuando** `retryInvoice`, **Entonces** el `enqueue` usa 6 (leído de la fila), no el default por tipo.
2. **Dado** una factura B autorizada con `condicion_iva_receptor=6`, **Cuando** `anularFactura`, **Entonces** la NC-B se declara con condición 6.

---

### Edge Cases

- **Filas históricas sin la columna** (`condicion_iva_receptor = NULL`): en retry/anulación de un comprobante viejo, `condicionIvaFor` cae al **default por tipo** (A→1, B→5) — exactamente el comportamiento de hoy. La columna NULL = "no declarada explícitamente", nunca rompe. Test explícito.
- **CUIT cargado y después el operador cambia a tipo sin CUIT / borra el CUIT**: el selector de condición se oculta y la condición vuelve a Consumidor Final (sin CUIT no hay receptor identificado). Verificar que no quede un `condicionIvaReceptor` "pegado" en el estado del cliente.
- **Condición inválida** (fuera de {1,4,5,6}) llegando a la action: rechazo por Zod en el borde (no confiar en el cliente).
- **B con CUIT + Consumidor Final (5)** elegido a propósito: combo raro pero no imposible (CUIT informativo). Se permite si el operador lo elige explícitamente; lo que se prohíbe es el default silencioso. (A validar con Juan — ver "a verificar".)
- **Pedido flash** (`pedido-flash-dialog.tsx`) y **re-emisión desde el detalle** (`invoice-detail-sheet.tsx`): mismos callers de `emitInvoice`, deben pasar la condición cuando hay CUIT. No dejar un caller sin cubrir (re-abriría el agujero).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE aceptar una **condición de IVA del receptor** explícita (`1|4|5|6`) en el flujo de emisión (`EmitInput` → `InvoiceRequest`), validada con Zod en el borde.
- **FR-002**: El sistema DEBE **persistir** la condición en `invoices.condicion_iva_receptor` en la reserva del comprobante (`emit-invoice.ts:220-238`).
- **FR-003**: `condicionIvaFor` (o su reemplazo) DEBE usar la condición **explícita cuando está presente**, y solo caer al default por tipo (A→1, B→5) cuando es `NULL`/ausente — preservando el comportamiento histórico para consumidor final sin CUIT y para filas viejas.
- **FR-004**: El sistema DEBE **rechazar** una emisión **B/NC-B con CUIT sin condición explícita** (reemplaza el blindaje interino de `emit-invoice.ts:186-190`, que se ELIMINA).
- **FR-005**: `retryInvoice` (`emit-invoice.ts:~487`) y `anularFactura` (`emit-invoice.ts:~638`) DEBEN reconstruir el `enqueue` con la condición **leída de la fila** `invoices`, no re-derivada del tipo.
- **FR-006**: La **UI de cobro** (`cobrar-client.tsx`) DEBE mostrar un selector de condición (RI/Monotributo/Exento/CF) **cuando hay CUIT**, y pasarlo a `emitInvoice`. Sin CUIT, el selector no aparece y la condición es Consumidor Final.
- **FR-007**: Los callers `pedido-flash-dialog.tsx` e `invoice-detail-sheet.tsx` DEBEN pasar la condición cuando corresponda (paridad con el cobro de mesa).
- **FR-008**: El comportamiento del camino feliz **sin CUIT** (Factura B a consumidor final) DEBE quedar **byte-idéntico** al actual: `condicion_iva=5`, `doc_tipo=99`.
- **FR-009**: La condición inválida o inconsistente (p. ej. valor fuera del enum) DEBE ser rechazada por validación, nunca enviada al gateway.

### Key Entities

- **invoices**: nueva columna `condicion_iva_receptor smallint NULL` (persiste la condición declarada; NULL = default histórico por tipo). Ya tiene `cuit_receptor`, `razon_social_receptor`.
- **InvoiceRequest** (`types.ts:51`): nuevo campo opcional `condicionIvaReceptor?: CondicionIvaReceptor`.
- **EmitInput** (`emit-invoice.ts:36`): nuevo campo opcional `condicionIvaReceptor`.
- **CondicionIvaReceptor** (`types.ts:42`): ya existe (`1|4|5|6`) — se reutiliza, no se cambia.

## Success Criteria *(mandatory)*

- **SC-001**: Se puede emitir Factura/NC **B con CUIT** declarando la condición real del receptor (Monotributo/Exento/RI), y ARCA la recibe correcta.
- **SC-002**: El hardcode A→1 y B→5 deja de aplicar cuando hay una condición explícita; el default histórico se mantiene solo como fallback (sin CUIT / filas viejas).
- **SC-003**: Retry y nota de crédito de un comprobante con condición declarada **conservan** esa condición.
- **SC-004**: El camino feliz de golf-house (B a consumidor final sin CUIT, A a RI) **no cambia** — cero regresión, verificado por el test de integración existente `emit-invoice.integration.test.ts`.
- **SC-005**: Cerrado el R-C6, el **issue #51 queda sin ítems pendientes** y se cierra.

## Relación con el issue #51 (bloque 36C)

Este spec implementa **R-C6**, el único ítem que mantiene abierto el issue [#51](https://github.com/gachetponzellini/RestaurantOS-app/issues/51). Los otros seis (R-C1 propina fuera de IVA, R-C2 scope rendición, R-C3 refund revierte split, R-C4 anularCobro no resucita cancelados, R-C5 stock atómico, R-D1 promos por customer_id) ya están implementados y verificados. Al mergear esta spec y verificar en vivo, **se cierra #51**.
