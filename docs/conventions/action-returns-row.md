# Convención: las Server Actions de mutación devuelven la fila mutada

> Establecida por la **spec 39** (fundaciones de performance percibida), FR-013/FR-014.

## Regla

Toda Server Action de **mutación** (crear/actualizar/borrar una fila) devuelve, en
su `ActionResult` de **éxito**, **la fila mutada tipada** — no `void`, no `null`,
no sólo un `ok: true` pelado.

```ts
// ✅ bien
async function registrarX(...): Promise<ActionResult<{ x: FilaX }>> {
  const { data, error } = await service.from("x").insert({...}).select("*").single();
  if (error) return actionError(...);
  return actionOk({ x: data as FilaX });
}

// ❌ evitar (fuerza al cliente a re-fetchear / router.refresh())
async function registrarX(...): Promise<ActionResult<void>> { ... }
```

## Por qué

El cliente hoy refleja las mutaciones con `router.refresh()`, que en
`/admin/operacion` **re-ejecuta todas las queries** de la página (era un
`Promise.all` de 15). Devolver la fila mutada habilita que specs posteriores
(fases 2 y 3 del análisis
[`wiki/analyses/perf-percibida-operacion-mozo.md`](../../../../wiki/analyses/perf-percibida-operacion-mozo.md))
**mergeen localmente** esa fila (por `id`) en lugar de refrescar toda la vista,
logrando instantaneidad **sin adivinar** el resultado.

## Regla de oro (spec 21 — dinero)

Esta convención es **andamiaje**, no habilita optimismo de plata:

- Para superficies de **plata/fiscal/ruteo-a-cocina**, la fila se mergea **después**
  del `ok` (la que el server YA persistió), **nunca** un incremento local ni una
  marca de "pagado" antes del `ok`.
- **Todo merge es por `id`** (upsert/replace), jamás `push`/`increment`: en tablas
  donde el cliente **suma** (rendición, contadores de caja), un merge ciego =
  **plata duplicada**. Deduplicar por `id`.

## Estado / pilotos

- **Piloto (spec 39):** [`registrarRendicionMozo`](../../src/lib/caja/actions.ts)
  ya devuelve `{ rendicion: MozoRendicion }`. Forma verificada por
  [`src/lib/caja/rendicion-shape.test.ts`](../../src/lib/caja/rendicion-shape.test.ts).
- **Siguiente (fase 3):** aplicar el merge-por-fila real en Caja (sangría/ingreso/corte)
  y Rendición, reemplazando `router.refresh()` — fuera del alcance de la spec 39.
