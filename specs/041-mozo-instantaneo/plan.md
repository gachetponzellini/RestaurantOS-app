# Implementation Plan: Mozo instantáneo (cobro sin refresh + envío seguro)

**Branch**: `master` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md) | **Issue**: [#57](https://github.com/gachetponzellini/RestaurantOS-app/issues/57)

## Summary

Dos frentes del flujo caliente del mozo, **sin tocar el server de plata** (los contratos ya devuelven lo necesario):

1. **US1 · Cobro instantáneo** — en `cobrar-client.tsx` (mozo), reemplazar `onPaid → router.refresh()` por un **merge de la fila que `registrarPago` ya persistió** (`{ payment, splitDone, orderClosed }`). `splits` pasa a `useState`; se re-sincroniza con el server tras cada `router.refresh()` (MP/anulación). Dedup por `payment.id`. Redirect por `orderClosed` del server, no por math del cliente. MP se mantiene en refresh.
2. **US2 · Envío seguro** — en `pedir-client.tsx`, capturar el throw del envío (fallo de red) con mensaje explícito de verificación, y al enviar OK quitar del carrito **solo** los ítems enviados.

Lógica de plata extraída pura y testeable en `src/lib/billing/split-merge.ts` (TDD).

## Technical Context

**Language/Version**: TypeScript 5 · React 19.1 · Next.js 15.5.
**Storage**: **sin migraciones** — `registrarPago` ya devuelve la fila + flags.
**Testing**: Vitest — unit puro del merge (dedup / solo-server / orderClosed / re-sync).
**Constraints**: nunca marcar cobrado antes del `ok`; MP intacto; cero sobrecobro visual.
**Scope**: 1 helper puro + su test, 1 refactor de `cobrar-client.tsx` (+ su `CobrarSplitSheet`), 1 hardening en `pedir-client.tsx`.

## Constitution Check

*GATE reforzado — constitución §"Flujo de trabajo", caso **3 (dinero real: pagos)**.*

| Principio | Impacto | Cómo se respeta |
|---|---|---|
| I · Multi-tenancy | Nulo | No cambian queries; el merge usa la fila que el server (ya scopeada) devolvió. |
| II · Test-First (dinero) | **Alto** | El merge de plata se escribe como función pura con test **rojo→verde** antes del refactor de UI (dedup, solo-server, orderClosed, re-sync). |
| III · Server Actions + Zod | Nulo | No se agregan/mutan actions. `registrarPago` intacto. |
| IV · Dinero en centavos | Directo | Se suma `payment.amount_cents` (centavos) tal cual del server; nunca floats ni estimaciones. |
| V · Secretos | Nulo | — |
| VI · Spec-Driven | — | Este plan es el gate. |
| VII · Migraciones | Nulo | **Sin migración** (la idempotencia server, que sí la necesita, es Non-Goal → 042). |

## Decisión clave: por qué merge-de-fila y no `useOptimistic`

- **Plata = nunca optimista** (spec 21). Se mergea **después** del `ok`, con `payment.amount_cents` que el server persistió → instantáneo **sin adivinar**.
- **MP separado**: el pago MP lo registra el **webhook**; el cliente no tiene fila → unificar el callback marcaría cobrado sin confirmación = **doble cobro**. MP sigue con `router.refresh()`.
- **Redirect por `orderClosed`**: una suma de splits en el cliente podría divergir del cierre real de la orden; solo la señal del server cierra la mesa.
- **Re-sync tras refresh**: al subir `splits` a `useState`, un `router.refresh()` (MP/anular) trae splits frescos por props → un `useEffect([init])` resetea el estado local (splits + set de pagos aplicados) para no conservar merges viejos.

## Project Structure

```text
src/lib/billing/split-merge.ts        # NEW · merge puro (dedup + solo-server + closed)
src/lib/billing/split-merge.test.ts   # NEW · unit (FR-002/003/005/006/011) — TDD
src/app/[business_slug]/mozo/mesa/[id]/cobrar/cobrar-client.tsx   # MOD · splits→useState + merge + re-sync
src/app/[business_slug]/mozo/mesa/[id]/pedir/pedir-client.tsx     # MOD · catch throw + quitar solo enviados
```

## Complexity Tracking

- **`splits` de `const` a `useState` + re-sync:** el riesgo es que un merge viejo pise la verdad del server tras un refresh. Mitigado con el `useEffect([init])` que resetea a los splits del `init` fresco, y con dedup por `payment.id`.
- **Camino MP:** se deja **exactamente** como está (refresh); el único cambio es que el callback de efectivo/tarjeta pasa a mergear. Dos callbacks separados evitan el doble-cobro.
