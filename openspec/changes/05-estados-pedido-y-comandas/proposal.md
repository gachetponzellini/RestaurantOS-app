# 05-estados-pedido-y-comandas — Colapsar estados y auto-march a cocina

> Estado: 📋 propuesto · Origen: Reunión §4 (App del Mozo) · §7.5 · §7.8 · §7.9 · §6 · Design: sí

## Por qué

En la demo se decidió **simplificar el ciclo de vida operativo del pedido**. Hoy el mozo gestiona un
estado intermedio "Empezar" (botón que pasa la comanda de `pendiente` → `en_preparacion`) que no aporta
valor: el equipo quiere **un solo gesto operativo** "Entregar → Entregado". Además, los pedidos de
**teléfono / delivery / online** hoy esperan una **confirmación manual** del mostrador
(`confirmarPedido`) antes de bajar a cocina; se acordó que vayan **directo a cocina (auto-march)** y que
sea **la cocina** quien avise si falta un producto (por handy / timbre), no el sistema. Por último, se
quita el aviso **"listo para servir"**: la cocina avisa por fuera, no hace falta un estado `ready` que
genere ruido.

## Qué cambia

- Se **elimina** el botón/estado "Empezar" del flujo del mozo: la comanda enviada queda **activa** y el
  único gesto del mozo es **marcarla entregada** (cerrada).
- Los pedidos con origen **online / delivery / take-away** hacen **auto-march**: al confirmarse el
  pedido (pago o creación), se crean las comandas y el pedido pasa directo a `preparing` **sin** paso
  manual de "empezar".
- Se **quita el aviso "listo para servir"**: el estado `ready` deja de usarse en el flujo operativo del
  salón (la cocina avisa por handy/timbre).
- La comanda colapsa a dos lecturas operativas: **activa** (enviada, no entregada) y **cerrada**
  (entregada). Los estados `pendiente` y `en_preparacion` se muestran ambos como "activa".

## Alcance

**Incluye:**
- Quitar el avance manual `pendiente → en_preparacion` del lado del mozo (UI + acción).
- Auto-march de pedidos online/delivery/take-away (sin esperar confirmación manual del mostrador).
- Sacar `ready` del flujo del salón (labels, transiciones y avisos), sin romper datos históricos.
- Ajustar etiquetas de estado (`status-meta.ts`) para reflejar "activa/cerrada".

**No incluye (fuera de alcance):**
- KDS con tiempos/ETA por estación (usa `prep_time_minutes`, queda como cambio aparte).
- Cambiar el modelo de pago (sólo se observa si el online está pagado / paga efectivo).
- Reescribir la máquina de estados de la **mesa** (`libre/ocupada/pidio_cuenta` se mantiene).

## Impacto

- **Archivos** (reales):
  `src/lib/orders/status.ts`, `src/lib/orders/status-meta.ts`, `src/lib/orders/update-status.ts`,
  `src/lib/orders/confirm-order.ts`, `src/lib/comandas/actions.ts`, `src/lib/comandas/types.ts`,
  `src/lib/comandas/routing.ts`, `src/lib/comandas/route-items.ts`,
  `src/lib/mozo/state-machine.ts`, `src/components/mozo/order-summary-card.tsx`.
- **Datos:** sin cambios de schema (los estados ya existen en migraciones `0025/0026`). Si se decide
  agregar un flag de origen para decidir el auto-march de forma explícita, sería
  `0052_orders_auto_march.sql` (ver Preguntas abiertas); por defecto se deriva de
  `orders.delivery_type` actual (`dine_in` vs delivery/take-away/web).
- **Tipos:** n/a salvo migración → `pnpm db:types`.
- **Permisos:** revisar `canConfirmOrder` en `src/lib/permissions/can.ts` (el auto-march reduce el uso
  de la confirmación manual a un fallback).
- **Integraciones:** n/a (la impresión a comanderas se mantiene; sólo cambia **cuándo** se dispara).

## Riesgos

- **Cross-módulo** (orders ↔ comandas ↔ mozo): un cambio mal coordinado deja pedidos sin comanda o con
  doble comanda → mitigación: ver `design.md` (contrato único de creación de comandas) y tests de
  integración.
- Quitar `ready` puede romper queries/labels que lo asumen → mitigación: mantener el valor en el enum de
  datos pero sacarlo del flujo y mapearlo a "activa" en la UI.
- Auto-march de un pedido **no pagado** podría mandar a cocina algo que no se cobra → mitigación: mostrar
  en comanda el estado de pago (pagado / paga efectivo) y decidir política en `design.md`.

## Preguntas abiertas

- [ ] ¿El auto-march se dispara al **crear** el pedido online o sólo cuando está **pagado**?
- [ ] ¿Conviene un flag explícito `orders.auto_march` o alcanza con derivar de `delivery_type`?
- [ ] ¿Algún reporte histórico depende del estado `ready` y habría que migrarlo?
