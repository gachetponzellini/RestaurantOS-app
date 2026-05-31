# Design — 05-estados-pedido-y-comandas Colapsar estados y auto-march a cocina

## Contexto y problema

El cambio toca **dos máquinas de estados** acopladas y un **contrato cross-módulo**:

- **Estado del pedido** (`orders.status`, `src/lib/orders/status.ts`):
  `pending → confirmed → preparing → ready → on_the_way → delivered` (+ `cancelled`).
- **Estado de la comanda** (`src/lib/comandas/types.ts`):
  `pendiente → en_preparacion → entregado` (el estado `listo` ya fue eliminado en `0026`).

Hoy:
1. El mozo opera la comanda en **dos gestos** ("Empezar" `pendiente→en_preparacion` y "Entregar"
   `en_preparacion→entregado`) vía `advanceComandaStatus` / `marcarComandaEntregada`
   (`src/lib/comandas/actions.ts`) desde `order-summary-card.tsx`.
2. Los pedidos online/delivery/take-away requieren **confirmación manual** del mostrador
   (`confirmarPedido`, `src/lib/orders/confirm-order.ts`), que recién ahí crea comandas y pasa la order a
   `preparing`.
3. El estado `ready` ("listo para servir") existe en el flujo del pedido y genera un aviso que el equipo
   no quiere.

La reunión pide: **un solo gesto del mozo**, **auto-march** de online a cocina, y **sacar el aviso
"listo"**. El riesgo es romper el acoplamiento orders↔comandas (pedidos sin comanda o con doble comanda)
y dejar labels/queries que asumen `ready`.

## Opciones consideradas

1. **Borrar `ready` y `en_preparacion` del enum de datos (migración destructiva).**
   - Pros: modelo más chico, imposible volver a usarlos.
   - Contras: rompe filas históricas y reportes; migración riesgosa en deploy on-site; irreversible.

2. **Conservar los valores de datos y colapsarlos sólo en la capa de presentación/flujo
   (sin migración destructiva).** *(elegida)*
   - Pros: cero riesgo sobre datos históricos; reversible; el cambio vive en lógica pura + UI; el
     auto-march se deriva de `delivery_type`.
   - Contras: el enum de datos queda "más grande" que el flujo real (deuda cosmética documentada).

3. **Auto-march disparado por un trigger de base de datos.**
   - Pros: garantiza creación de comandas sin pasar por la app.
   - Contras: la lógica de ruteo de sector ya vive en TS (`resolveStation`); duplicarla en SQL es frágil
     y difícil de testear; rompe el patrón "mutaciones en Server Actions".

## Decisión

Tomamos la **Opción 2**: colapsar en **lógica + presentación**, sin migración destructiva.

- **Mozo, un solo gesto:** se quita el botón "Empezar" de `order-summary-card.tsx` y se deja de exponer
  la transición `pendiente → en_preparacion` al mozo. "Entregar" llama a `marcarComandaEntregada`. Para
  que "Entregar" funcione desde `pendiente`, `marcarComandaEntregada` debe aceptar como origen tanto
  `pendiente` como `en_preparacion` (hoy exige `en_preparacion`).
- **Auto-march:** la creación de comandas para pedidos `delivery_type != 'dine_in'` se dispara
  automáticamente en el punto de confirmación/pago, reutilizando el mismo cuerpo de `confirmarPedido`
  (ruteo + `createComandasForItems` + order a `preparing`). `confirmarPedido` queda como **fallback
  manual idempotente**; el auto-march llama a la misma rutina de ruteo (sin duplicar lógica).
- **Sacar `ready`:** el flujo del salón no usa `ready`. Se ajustan `status.ts` (transiciones) y
  `status-meta.ts` (labels) para que `ready` no sea un paso operativo; en UI, cualquier `ready`
  histórico se muestra como "activa". No se borra el valor del enum de datos.
- **Comanda activa/cerrada:** `status-meta` (o el componente del mozo) mapea
  `{pendiente, en_preparacion} → "activa"` y `{entregado} → "cerrada"`.

## Impacto técnico

- **Máquina de estados (antes → después):**

  Pedido (flujo operativo del salón):
  ```
  ANTES:  pending → confirmed → preparing → ready → on_the_way → delivered
                                              └ aviso "listo" (se quita)
  DESPUÉS (salón): pending → preparing → delivered
                   (ready/on_the_way siguen existiendo en datos; no gobiernan el salón)
  DESPUÉS (delivery): pending → [auto-march] → preparing → on_the_way → delivered
  ```

  Comanda (gesto del mozo):
  ```
  ANTES:  pendiente --(Empezar: mozo)--> en_preparacion --(Entregar: mozo)--> entregado
  DESPUÉS: pendiente -------------------(Entregar: mozo)-------------------> entregado
           (en_preparacion sigue siendo válido como estado de datos; el mozo no lo gatilla)
           Lectura: {pendiente, en_preparacion} = "activa" · {entregado} = "cerrada"
  ```

- **Datos:** sin migración destructiva. Opcional `0052_orders_auto_march.sql` con
  `orders.auto_march boolean default false` si se quiere un flag explícito en vez de derivar de
  `delivery_type` (ver Preguntas abiertas del proposal). RLS heredada de `orders` (scope `business_id`).

- **Contratos entre módulos:**
  - `orders` (auto-march / `confirm-order.ts`) **llama** a `comandas/routing.ts::resolveStation` y
    `comandas/route-items.ts::createComandasForItems` — **contrato único** de creación de comandas
    (ni el auto-march ni el fallback manual crean comandas por otro camino).
  - `mozo` (`order-summary-card.tsx`) **llama** a `comandas/actions.ts::marcarComandaEntregada`
    (único gesto). Ya no llama a `advanceComandaStatus` para "Empezar".
  - `mozo/state-machine.ts` (mesa) **no** cambia: `libre/ocupada/pidio_cuenta` se mantiene.

- **Multi-tenant / RLS:** todo el ruteo y la creación de comandas se hace con `business_id` del pedido;
  las policies de `comandas`/`order_items` (migraciones `0025/0026/0034`) ya scopean por negocio. El
  auto-march no cruza negocios.

## Trade-offs y consecuencias

- **Deuda asumida:** el enum de datos de pedido (`ready`) y de comanda (`en_preparacion`) queda más
  amplio que el flujo real. Es intencional y reversible; se documenta para no "resucitar" esos estados.
- **Política de pago en auto-march:** queda pendiente decidir si se hace auto-march de pedidos **no
  pagados** (ver Preguntas abiertas). Mitigación interina: mostrar estado de pago en la comanda.
- **Plan de reversión:** como no hay migración destructiva, revertir es volver a exponer el botón
  "Empezar" y desactivar el disparo automático (volver a `confirmarPedido` manual). Cero pérdida de
  datos.
