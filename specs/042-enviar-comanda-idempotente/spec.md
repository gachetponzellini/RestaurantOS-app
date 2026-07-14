# Feature Specification: Idempotencia transaccional de enviarComanda

**Feature Branch**: `042-enviar-comanda-idempotente`

**Created**: 2026-07-14

**Status**: 🟡 Implementada (2026-07-14) — migración `0009` aplicada al cloud, server + cliente + test de integración verde. Falta **verify en vivo con rol real** (mozo). Issue [#59](https://github.com/gachetponzellini/RestaurantOS-app/issues/59).

**Input**: Fast-follow de la [spec 041](../041-mozo-instantaneo/spec.md), que cerró la capa **cliente** del bug (feedback de fallo, no reenviar a ciegas) pero dejó explícito que el fix completo — **idempotencia server** — "requiere migración y va en una spec aparte". Hermana del fix de cobro ([migración 0007](../../supabase/migrations/0007_cobro_idempotente_transaccional.sql), issue #58), pero sobre **envío a cocina** en vez de **cobro**.

## Contexto y problema

`enviarComanda` (mozo manda ítems a cocina) **inserta un `order_item` por cada línea del carrito y crea una comanda por sector**. No tiene guarda de idempotencia: si la misma llamada llega dos veces —doble-tap antes de que el botón se deshabilite, retry de red, respuesta perdida— se **insertan los order_items de nuevo** (ids nuevos) y se **crea una segunda comanda** (batch 2). Resultado: cocina recibe el pedido duplicado, la cuenta se infla y el stock se descuenta dos veces.

A diferencia del cobro (una sola fila `payment`), acá la duplicación es **a nivel de líneas**: no alcanza con deduplicar la comanda, hay que evitar reinsertar los `order_items`.

**Clave del diseño:** cada línea del carrito del mozo ya tiene un `_key` estable (uuid generado al agregarla, `crypto.randomUUID()`). Ese `_key` viaja al server como `client_line_key` y se persiste en el `order_item`. Un índice **UNIQUE parcial** `(order_id, client_line_key)` hace la inserción idempotente: la segunda vez choca con el índice y la línea se saltea. Un reenvío **legítimo** del mismo producto más tarde es otra línea de carrito (otro `_key`) → NO se deduplica. No hace falta tabla de dispatch ni hash de contenido.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Doble-submit no duplica la comanda (Priority: P1)

El mozo carga ítems y toca "Enviar". Por doble-tap o un retry de red, `enviarComanda` corre dos veces con el mismo carrito.

**Why this priority**: Correctitud money + cocina. Un envío duplicado ensucia la cocina, dobla la cuenta y descuenta stock de más — es el mismo tipo de bug que el doble-submit de cobro (#58), que fue crítico.

**Independent Test**: Llamar `enviarComanda` dos veces con los mismos `client_line_key` → una sola tanda de order_items y una sola comanda; el segundo llamado devuelve la comanda existente.

**Acceptance Scenarios**:

1. **Dado** un envío con líneas con `client_line_key`, **Cuando** llega un segundo envío idéntico (mismos keys), **Entonces** NO se insertan order_items nuevos ni se crea una comanda extra: la orden queda igual que tras el primer envío.
2. **Dado** ese segundo envío, **Cuando** responde, **Entonces** devuelve `ok` con los `comanda_ids` **de la tanda original** (respuesta idempotente estable), no vacío ni nuevos.
3. **Dado** el reenvío, **Cuando** se recalcula el total de la orden, **Entonces** el total NO se dobla (suma de ítems no-cancelados reales).
4. **Dado** que el stock se descuenta por trigger al insertar el order_item, **Cuando** la línea se saltea por dup, **Entonces** el stock se descuenta **una sola vez**.

### User Story 2 - Reenvío legítimo del mismo producto NO se confunde con dup (Priority: P2)

El mozo envía 1 empanada, y 10 minutos después envía otra empanada (nueva línea de carrito).

**Why this priority**: La idempotencia no debe romper el caso normal de "mandar de nuevo lo mismo, a propósito".

**Independent Test**: Dos envíos del mismo `product_id` con `client_line_key` **distintos** → dos order_items, batch incremental por sector (comportamiento actual preservado).

**Acceptance Scenarios**:

1. **Dado** dos líneas del mismo producto con keys distintos, **Cuando** se envían (aunque sea en tandas separadas), **Entonces** se insertan las dos y la comanda del sector incrementa `batch` (1, 2) como hoy.

### Edge Cases

- **Concurrencia real** (dos requests casi simultáneos, mismo key): el chequeo up-front puede ver la línea como nueva en ambos; el índice UNIQUE cierra la carrera — el `insert` perdedor recibe `23505` y la línea se saltea sin abortar el envío.
- **Líneas sin `client_line_key`** (clientes viejos, tests, otros flujos): `client_line_key = NULL` → fuera del índice parcial → comportamiento previo (sin dedup). Retrocompatible.
- **Combos (menú del día)**: el `client_line_key` va en el **padre**; si el padre es dup, se saltean padre + hijos.

## Requirements *(mandatory)*

- **FR-001**: `order_items` gana columna `client_line_key uuid` (nullable) + índice UNIQUE parcial `(order_id, client_line_key) where client_line_key is not null`. Migración `0009`.
- **FR-002**: `enviarComanda` acepta `client_line_key` por ítem (producto y menú del día) y lo persiste en el `order_item`.
- **FR-003**: Antes de insertar, `enviarComanda` resuelve qué `client_line_key` ya existen para la orden y saltea esas líneas (dedup secuencial).
- **FR-004**: El `insert` maneja la violación `23505` del índice como "línea ya enviada" → saltea la línea sin abortar el resto del envío (dedup concurrente).
- **FR-005**: La respuesta incluye los `comanda_ids` de las líneas ya despachadas → estable en el reenvío.
- **FR-006**: El cliente (`pedir-client.tsx`) manda el `_key` de cada línea del carrito como `client_line_key`.
- **FR-007**: Retrocompatible: flujos que no setean `client_line_key` no cambian.

## Success Criteria *(mandatory)*

- **SC-001**: Reenviar el mismo carrito (mismos keys) no crea order_items ni comandas duplicadas. *(test de integración)*
- **SC-002**: El total de la orden no se dobla en el reenvío. *(test)*
- **SC-003**: Dos líneas del mismo producto con keys distintos siguen generando dos ítems + batch incremental. *(cubierto por tests existentes)*
- **SC-004**: `pnpm typecheck` + `pnpm test` (comandas) en verde.
- **SC-005**: Verify en vivo con rol real (mozo): doble-tap real de "Enviar" no duplica la comanda en cocina. *(pendiente — manual)*
