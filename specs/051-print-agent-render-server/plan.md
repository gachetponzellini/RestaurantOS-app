# Implementation Plan: 051 — Render del ticket en el servidor (print-agent como relay)

## Enfoque

Mover el "qué/cómo imprimir" del `.exe` al server **con paridad byte-a-byte** de lo que golf imprime hoy, para que a futuro un cambio de formato sea **solo un deploy de Vercel**. El render del agente ([`agent.mjs:80-166`](../../print-agent/agent.mjs)) son 3 funciones puras (`ticketLines` + `renderEscPos` + `renderPlain`) que se portan **tal cual** a un módulo del server; el `GET /api/print-agent` agrega el contenido ya renderizado **de forma aditiva**; el agente pasa a ser un **relay** que imprime lo que le llega y **conserva su render local solo como fallback**. Es el desacople que desbloquea el spec 057 (avisos): una vez el server renderiza, el aviso es "otro contenido más" y el agente ni se entera.

**Prioridad: no romper la impresión en producción de golf.** Todo el cambio del lado del server es aditivo (un agente viejo lo ignora y sigue imprimiendo); el relay se despliega a golf **una única vez**, verificado, sin big-bang.

## Decisiones de diseño (cierran los `[NEEDS CLARIFICATION]` del spec)

- **D1 — Forma del contenido.** El GET suma a cada comanda dos campos **aditivos**: `content_escpos_b64` (los bytes ESC/POS que hoy produce `renderEscPos`, codificados **base64 desde `latin1`** para viajar en JSON) y `content_plain` (el texto de `renderPlain`, para transporte Windows/dry-run). El relay decodifica `content_escpos_b64` y lo escribe al socket **tal cual** (mismo `Buffer.from(b64,'base64')` → TCP que hoy hace `Buffer.from(payload,'latin1')`).
- **D2 — Módulo server testeable.** Portar el render a `src/lib/print/ticket.ts` (puro): `buildTicketLines(comanda)`, `renderEscPos(lines)`, `renderPlain(lines)`, con las **mismas constantes** (`CHAR_SIZE`, `CHAR_RIGHT_SPACING=4`, `LINE_SPACING=64`, `RULE` 24col). Reemplaza los harness copy-paste por tests del repo (FR-007).
- **D3 — Paridad garantizada por test.** Antes de mover, se congela el output actual del agente por tipo de ticket (normal, anulada, reimpresión, sin ítems) como **snapshot de bytes**; el test asevera que `src/lib/print/ticket.ts` produce **exactamente** esos bytes. Es la red que impide una regresión de formato sobre golf (SC-003).
- **D4 — Ancho de papel configurable (US3): DIFERIDO a fase 2.** Golf es **todo 58mm** hoy, así que fase 1 mantiene el ancho **hardcodeado a 58** (paridad exacta) y **no lleva migración**. Cuando aparezca una 80mm se suma `stations.paper_width` + se parametriza el render (US3/FR-008 quedan documentadas, no implementadas). Esto reduce la superficie del cambio sobre producción.
- **D5 — Degradación bidireccional (FR-004/FR-005).** El relay **conserva** `ticketLines`/`renderEscPos` como **fallback**: si el GET no trae `content_escpos_b64` (server viejo, rollback, o error de render), imprime con su render local mínimo en vez de cortar la impresión o escupir basura. Un agente viejo, al no conocer los campos, usa su render local igual → sigue imprimiendo. Ninguna de las dos combinaciones falla.
- **D6 — Encoding.** Paridad exacta: `latin1` (lo que ya se manda hoy). La mejora a codepage/CP850 para acentos queda **fuera** (no se cambia el byte-stream ahora).
- **D7 — Ciclo de confirmación intacto.** El `POST /api/print-agent` (ok/failed, ownership, estados) **no se toca**. El contenido pre-renderizado no altera la máquina de estados ni el heartbeat.

## Capas

### Server (dominio)
- `src/lib/print/ticket.ts` (nuevo): render portado 1:1 de `agent.mjs` (puro, sin I/O). Exporta `buildComandaContent(comanda) → { escpos_b64, plain }`.
- `GET /api/print-agent` ([`route.ts:94-150`](../../src/app/api/print-agent/route.ts)): por cada `printable`, agregar `content_escpos_b64` + `content_plain` vía `buildComandaContent`. Aditivo; el resto del payload (los datos estructurados) **se mantiene** para el agente viejo (FR-002).

### Agente (relay)
- `print-agent/agent.mjs`: en `printOne`, si `c.content_escpos_b64` y transport `network` → `printNetwork(Buffer.from(c.content_escpos_b64,'base64').toString('latin1'), ip, port)`; si transport `windows` y `c.content_plain` → `printWindows(c.content_plain, …)`. Si no viene contenido → **fallback** al render local actual (`renderEscPos(ticketLines(c))`). `ticketLines`/`renderEscPos`/`renderPlain` **quedan** como fallback. Dry-run muestra `content_plain ?? renderPlain(local)`.
- **Rebuild del `.exe`** (`@yao-pkg/pkg`, `node22-win-x64`) + resubir a `print-agent-releases` (spec 046). **Es la última resubida por formato** — de acá en más el formato es deploy de server.

### Datos
- **Ninguno en fase 1** (ancho de papel diferido, D4).

## Orden (TDD)
1. Congelar snapshots del render actual por tipo de ticket (harness temporal → fixtures).
2. `src/lib/print/ticket.ts` (portado) + tests de **paridad** contra los snapshots (normal/anulada/reimpresión/sin ítems).
3. `GET` suma `content_escpos_b64`/`content_plain` (aditivo) + test (campos presentes, base64 válido, se conservan los datos estructurados).
4. `agent.mjs` relay: imprime contenido si viene, fallback local si no; dry-run.
5. `pnpm typecheck` + `pnpm test` verdes.
6. **Rebuild `.exe`** + resubir al bucket.
7. **Verify en vivo en golf** (rol real + hardware): instalar el relay, imprimir una comanda de **cada tipo** y comparar con el ticket viejo (paridad); luego un cambio de formato de prueba **solo deploy** confirma SC-001. Migrar golf al relay.

## Riesgos
- **Regresión de formato sobre producción**: mitigado por los tests de paridad byte-a-byte (D3) — el server debe producir exactamente los bytes de hoy antes de tocar golf.
- **Rollback del server**: el relay conserva render local de fallback (D5) → nunca queda sin imprimir.
- **`latin1`/acentos**: se preserva el byte-stream actual (D6); no se introduce cambio de encoding en este spec.
- **Coordinación del deploy**: server primero (aditivo, no rompe al agente viejo), luego el relay a golf una vez. El orden inverso también es seguro por el fallback.
- **Sesiones paralelas** tocando `agent.mjs`/`route.ts`: chequear `git log`/`fetch` antes de commitear (memoria de repo compartido).
