# Tasks: 051 — Render del ticket en el servidor (print-agent como relay)

Leyenda: `[ ]` pendiente · `[x]` hecho. Fase 1 = desacople con paridad 58mm (sin config de ancho, sin migración).

## Paridad (red de seguridad primero)
- [x] **T001** Congelar el output actual del agente como fixtures: para comanda **normal / anulada / reimpresión / sin ítems**, capturar `renderEscPos(ticketLines(c))` (bytes) y `renderPlain(...)`. Guardar en `src/lib/print/__fixtures__/`. → `src/lib/print/__fixtures__/tickets.json`.

## Server — render portado
- [x] **T002** `src/lib/print/ticket.ts`: portar `ticketLines` → `buildTicketLines`, `renderEscPos`, `renderPlain` **1:1** de `agent.mjs` (mismas constantes `CHAR_SIZE`/`CHAR_RIGHT_SPACING=4`/`LINE_SPACING=64`/`RULE`). Export `buildComandaContent(comanda) → { escpos_b64, plain }` (base64 desde `latin1`) (FR-001, D1/D2). **Nota:** única desviación del 1:1 = fecha con `timeZone` AR explícito (el server corre en UTC; en golf da idéntico). Bug pre-existente del reloj 12h ("06:30" por 18:30) se **preserva** por paridad — fix = follow-up server-only (el payoff del spec).
- [x] **T003** Test de **paridad** `ticket.test.ts`: `buildComandaContent` produce **exactamente** los fixtures de T001 para los 4 tipos (FR-006, FR-007, SC-003). + base64 round-trip = bytes originales. → 9 tests verdes.

## API
- [x] **T004** `GET /api/print-agent`: agregar `content_escpos_b64` + `content_plain` por comanda (aditivo, conserva los datos estructurados) (FR-002, FR-003). Test: campos presentes + base64 decodifica a bytes ESC/POS + el payload viejo intacto. **Seguridad:** el saneo (`sanitizeTicketText`, review #8) corre antes del render → sin regresión de inyección.

## Agente (relay)
- [x] **T005** `agent.mjs`: `printOne` imprime `content_escpos_b64` (network) / `content_plain` (windows) tal cual si vienen; **fallback** al render local (`renderEscPos(ticketLines(c))`) si no (FR-003, FR-004, FR-005, D5). Dry-run usa `content_plain` con fallback. `ticketLines`/`renderEscPos`/`renderPlain` quedan como fallback.
- [~] **T006** Rebuild `.exe` (`@yao-pkg/pkg`, `node22-win-x64`) **hecho** (`~/Desktop/print-agent-build/print-agent-new.exe`, 57.5 MB). **Pendiente: resubir a `print-agent-releases`** (tras commit + deploy del server). **Última resubida por formato** (FR-011).

## Cierre
- [x] **T007** `pnpm typecheck` + `pnpm test` verdes (789 pasan; el único fallo es `cuenta.integration`, timeout de cloud pre-existente y ajeno a este cambio).
- [ ] **T008** Verify en vivo en **golf** (rol real + hardware): imprimir una comanda de **cada tipo** con el relay y comparar con el ticket viejo (paridad, SC-003/SC-004); un cambio de formato de prueba **solo con deploy** confirma SC-001. Migrar golf al relay. Actualizar `wiki/features/comandas.md` + `wiki/specs/README.md` + log. Comentar + cerrar la issue.

## Fase 2 (documentada, no en este alcance)
- Ancho de papel por sector (`stations.paper_width` 58/80 + migración + render parametrizado) — US3/FR-008. Se activa cuando aparezca una 80mm.
- Codepage/CP850 para acentos (hoy `latin1` por paridad).
