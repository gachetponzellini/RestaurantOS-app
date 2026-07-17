# Plan — 050 Atajo "Como entrada"

## Enfoque

Reutilizar el pipeline de `notes` del ítem. El único dato nuevo es un booleano de UI (`asEntrada`) en el modal, que se **compone** con el texto libre al momento de agregar. No hay campo nuevo en DB ni en los tipos del carrito/comanda: lo que se persiste sigue siendo el string `notes`.

## Lógica pura (TDD primero)

`src/lib/mozo/item-notes.ts`:

```ts
export const ENTRADA_MARKER = "Como entrada";
export function composeItemNotes(input: { asEntrada: boolean; freeText: string }): string
```

- `trim` del texto libre.
- Si `asEntrada`: `freeText ? \`${ENTRADA_MARKER} · ${freeText}\` : ENTRADA_MARKER`.
- Si no: `freeText`.
- `.slice(0, 200)` sobre el resultado final.

Test co-ubicado `item-notes.test.ts` cubre: marcador solo, marcador + texto, sin marcador, trim, tope 200 (marcador sobrevive).

## UI

`src/components/mozo/product-modal.tsx`:
- Nuevo estado `const [asEntrada, setAsEntrada] = useState(false)`.
- Reset en el `useEffect` de cambio de producto (junto a `setNotes("")` etc.).
- Chip toggle "Como entrada" (icono lucide `UtensilsCrossed`) dentro del bloque Observaciones, arriba del textarea. Estilo tildado = emerald (consistente con modificadores seleccionados), destildado = zinc. Tap grande.
- `handleAdd`: `notes: composeItemNotes({ asEntrada, freeText: notes })` en vez de `notes.trim().slice(0, 200)`.

Sin cambios en `pedir-client.tsx`, `enviarComanda`, tipos ni DB.

## Verificación

- `pnpm typecheck` + `pnpm test` (incluye el nuevo test).
- Verificación en vivo (rol real mozo): abrir modal, tildar, agregar, ver la observación compuesta en el resumen y en la comanda del kanban.

## Archivos tocados

- `src/lib/mozo/item-notes.ts` (nuevo)
- `src/lib/mozo/item-notes.test.ts` (nuevo)
- `src/components/mozo/product-modal.tsx` (editado)
