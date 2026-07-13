# Print agent (referencia — spec 28 / 33 / 35)

Programita que corre en una PC del local: lee las comandas `pendiente` de la app
y las imprime. Loop **pull → imprimir → confirmar**. No es parte del build de
Next; corre suelto con Node (`node print-agent/agent.mjs`).

Además del pull, cada tick manda un **heartbeat** (`POST /api/print-agent/heartbeat`,
spec 35) para que operación vea el agente como "conectado". Es best-effort: si
falla no corta la impresión, solo aparece "sin conexión". La **reimpresión**
(spec 35) no requiere nada del agente: el server incluye las comandas con
reimpresión pedida en el mismo GET, así que el agente imprime lo que recibe.

## Config (`config.json`)

| campo | qué es |
|---|---|
| `serverUrl` | base de la app (ej. `http://localhost:3000`) |
| `printAgentKey` | debe coincidir con `PRINT_AGENT_KEY` del `.env.local` del server |
| `businessId` | UUID del negocio cuyas comandas imprime |
| `transport` | `windows` (driver/Out-Printer) o `network` (socket TCP ESC/POS) |
| `printerName` | sólo para `windows`: nombre exacto de la impresora instalada |
| `pollMs` | cada cuánto consulta (ms) |

- **`network`** = producción on-site: usa la `printer_ip`/`printer_port` que cada
  comanda trae en el GET (configurada en Configuración → Comanderas). Cero mapeo local.
- **`windows`** = prueba con impresora USB/no-térmica (ej. HP LaserJet): imprime
  por el driver del SO; la `printer_ip` de la comanda se ignora.

## Uso

```bash
node print-agent/agent.mjs --once --dry-run   # ve el ticket en consola (no imprime)
node print-agent/agent.mjs --once --limit=1   # imprime UNA comanda y confirma
node print-agent/agent.mjs                    # loop: imprime todo lo pendiente
```

Flags: `--once` (una pasada), `--dry-run` (no imprime ni confirma),
`--no-confirm` (imprime sin avanzar el estado), `--limit=N` (tope por corrida).

> El server tiene que tener `PRINT_AGENT_KEY` en `.env.local` (igual a
> `printAgentKey`). Si la agregás con el server prendido, **reiniciá `pnpm dev`**.
