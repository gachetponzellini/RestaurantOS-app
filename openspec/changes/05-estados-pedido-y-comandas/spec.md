# Spec — 05-estados-pedido-y-comandas Colapsar estados y auto-march a cocina

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.

## ADDED Requirements

### Requisito: Auto-march de pedidos online a cocina
El sistema DEBE crear las comandas y pasar el pedido a `preparing` **automáticamente** para pedidos con
`orders.delivery_type` distinto de `dine_in` (delivery / take-away / web / chatbot), **sin** requerir un
gesto manual de "empezar" del mostrador. El scope es por `business_id` (RLS).

#### Escenario: Pedido de delivery baja solo a cocina
- **Dado** un pedido web con `delivery_type = "delivery"` que se confirma (creación/pago)
- **Cuando** el sistema procesa el pedido
- **Entonces** se rutean los ítems por sector y se crean las comandas correspondientes
- **Y** el pedido queda en `preparing` sin intervención del mostrador

#### Escenario: La comanda muestra el estado de pago del pedido online
- **Dado** un pedido online que entra por auto-march
- **Cuando** la comanda se imprime/visualiza en cocina
- **Entonces** indica si el pedido está **pagado** o **paga en efectivo**
- **Y** la cocina avisa por handy/timbre si falta un producto (no lo hace el sistema)

#### Escenario: El auto-march es idempotente
- **Dado** un pedido online que ya generó comandas por auto-march
- **Cuando** el flujo intenta procesarlo otra vez (reintento / doble evento)
- **Entonces** no se crean comandas duplicadas
- **Y** el pedido permanece en `preparing`

### Requisito: Lectura de comanda activa vs cerrada
El sistema DEBE presentar la comanda en dos estados operativos: **activa** (enviada y no entregada) y
**cerrada** (entregada). Los estados de datos `pendiente` y `en_preparacion` se muestran ambos como
**activa**; `entregado` se muestra como **cerrada**.

#### Escenario: Comanda recién enviada se ve activa
- **Dado** una comanda con estado de datos `pendiente`
- **Cuando** el mozo la ve en su panel
- **Entonces** se muestra como **activa**

#### Escenario: Comanda entregada se ve cerrada
- **Dado** una comanda en estado `entregado`
- **Cuando** el mozo la ve en su panel
- **Entonces** se muestra como **cerrada**

## MODIFIED Requirements

### Requisito: Único gesto operativo del mozo "Entregar → Entregado"
Hoy el mozo avanza la comanda en dos pasos ("Empezar" `pendiente → en_preparacion`, luego "Entregar"
`en_preparacion → entregado`). El comportamiento cambia: el mozo tiene **un solo gesto operativo**,
**Entregar**, que marca la comanda como **entregada/cerrada**. El paso intermedio "Empezar" deja de
existir en la app del mozo.

#### Escenario: Mozo entrega sin paso intermedio
- **Dado** una comanda **activa** asignada a una mesa del mozo
- **Cuando** el mozo toca "Entregar"
- **Entonces** la comanda pasa a **entregada (cerrada)**
- **Y** no se le pidió antes "Empezar"

#### Escenario: No hay botón "Empezar" en la tarjeta del pedido
- **Dado** la tarjeta de pedido del mozo (`order-summary-card.tsx`)
- **Cuando** el mozo la abre
- **Entonces** no aparece la acción "Empezar"
- **Y** la única acción de avance es "Entregar"

## REMOVED Requirements

### Requisito: Aviso "listo para servir" en el flujo del salón
Se elimina el uso del estado/aviso **`ready`** ("listo para servir") en el flujo operativo del salón.
La cocina avisa por handy/timbre; el sistema no genera ese aviso. El valor `ready` puede permanecer en
el enum de datos por compatibilidad histórica, pero **no** se usa para gobernar el flujo del salón ni se
muestra como paso operativo.

#### Escenario: No se exige pasar por "listo" para entregar
- **Dado** una comanda activa de un pedido en `preparing`
- **Cuando** el mozo la entrega
- **Entonces** la comanda se cierra sin haber requerido un estado intermedio "listo para servir"

### Requisito: Avance manual "Empezar" de la comanda
Se elimina la transición manual `pendiente → en_preparacion` operada por el mozo (el botón "Empezar").
La comanda enviada ya queda **activa**; no requiere un gesto de "empezar" para considerarse en curso.

#### Escenario: La transición "Empezar" ya no está disponible para el mozo
- **Dado** un mozo viendo una comanda activa
- **Cuando** busca avanzarla manualmente a "en preparación"
- **Entonces** esa acción no está disponible en su app
