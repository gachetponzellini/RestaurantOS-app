# Tasks — 050 Atajo "Como entrada"

- [x] T1 — Test rojo: `src/lib/mozo/item-notes.test.ts` con casos (marcador solo / marcador+texto / sin marcador / trim / tope 200).
- [x] T2 — Implementar `src/lib/mozo/item-notes.ts` (`composeItemNotes`, `ENTRADA_MARKER`) hasta verde.
- [x] T3 — UI: estado `asEntrada` + reset en `useEffect` + chip toggle en el bloque Observaciones de `product-modal.tsx`.
- [x] T4 — Cablear `handleAdd` para componer `notes` con `composeItemNotes`.
- [x] T5 — `pnpm typecheck` + `pnpm test` en verde (7/7 item-notes).
- [x] T6 — Verificado en vivo (operación/pedido, mismo modal del mozo): tildar → agregar → "Como entrada · sin sal" en la línea del carrito.
- [x] T7 — Cerrar loop: bump submódulo en el brain, actualizar feature page + log, comentar y cerrar #74.
