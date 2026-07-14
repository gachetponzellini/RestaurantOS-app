# Tasks: Mozo instantáneo (cobro sin refresh + envío seguro)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Issue**: [#57](https://github.com/gachetponzellini/RestaurantOS-app/issues/57)

## Fase A — Merge de plata, TDD (US1)

- [x] **T001** `src/lib/billing/split-merge.test.ts` — unit **rojo** del merge: aplica pago al split por `split_id` (e implícito), dedup por `payment.id` (suma una sola vez), `splitDone → status paid`, `orderClosed → closed`, pago a split inexistente = no-op. **FR-002/003/005/011**.
- [x] **T002** `src/lib/billing/split-merge.ts` — implementación pura `applyPayment(state, result, hasImplicitSplit)` → `{ splits, appliedPaymentIds, closed }`. Verde.

## Fase B — Cobro instantáneo en la UI (US1)

- [x] **T003** `cobrar-client.tsx` — `splits`→`useState`; `useEffect([init])` re-sincroniza (splits + pagos aplicados) tras `router.refresh()`. **FR-006**.
- [x] **T004** `cobrar-client.tsx` + `CobrarSplitSheet` — separar callbacks: efectivo/tarjeta → `onPaidLocal(result)` (merge vía helper); MP → `onPaidRefresh()` (`router.refresh()`). "Registrando…" honesto. **FR-001/004/007/012**.
- [x] **T005** `cobrar-client.tsx` — cierre/redirect por `orderClosed` del server (o `init` ya-cerrado), no por math del cliente. **FR-005**.

## Fase C — Envío seguro (US2)

- [x] **T006** `pedir-client.tsx` — `try/catch` en `handleSend`: throw → mensaje explícito de verificar-antes-de-reenviar; al OK quitar del carrito solo los `_key` enviados (no `setCart([])`). **FR-008/009**.

## Fase D — Verify

- [x] **T007** `pnpm typecheck` + `pnpm test` verde (incl. split-merge) + `pnpm build`. **SC-005**.
- [x] **T008** Verify en vivo con rol real (mozo): cobro efectivo refleja al instante, MP sigue por refresh, cierre por server, fallo de envío muestra mensaje. **SC-001..006**. ✅ Validado por Juan (2026-07-14): funciona bien.
- [x] **T009** Cierre de loop: features (cobros/mozo) + `wiki/log.md`, comentar issue, bump submódulo.

> Todas las tasks completas. Spec 41 cerrada.
