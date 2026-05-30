# Tareas — 04-mozo-guarniciones-y-platos Guarniciones aparte y platos por observación

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.

## 1. Datos (si aplica)
- [ ] (Opcional, según Pregunta abierta) Migración `supabase/migrations/0052_product_is_side.sql`
      con `products.is_side boolean not null default false` + comentario; policies RLS heredadas de
      `products` (scope `business_id`). Sólo si se decide marcar guarniciones para analítica.
- [ ] Si se agrega la columna: `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- [ ] Seed/convención: grupo de adicionales "Punto de cocción" (jugoso/a punto/cocido,
      `is_required = true`, `min_selection = 1`, `max_selection = 1`, `price_delta_cents = 0`)
      aplicado a productos de parrilla.

## 2. Dominio (TDD)
- [ ] Test (rojo): `src/lib/catalog/schemas.test.ts` — un `ModifierGroupInput` "Punto de cocción"
      válido exige 3 modificadores con `price_delta_cents = 0`, único y obligatorio.
- [ ] Test (rojo): `src/lib/mozo/catalog-query.test.ts` — un producto de parrilla proyecta el grupo
      "Punto de cocción"; un plato elaborado no proyecta grupo "Guarnición".
- [ ] Implementar/ajustar validación en `src/lib/catalog/actions.ts`: al guardar un producto, advertir
      (no bloquear) si un grupo se llama "Guarnición"/"Guarniciones" (convención: guarnición = producto
      aparte).
- [ ] Confirmar en `src/lib/mozo/catalog-query.ts` que la guarnición agregada como producto resuelve su
      `station_id` para el ruteo de comanda.

## 3. UI
- [ ] `src/components/mozo/product-modal.tsx`: reforzar copy del grupo "Punto de cocción" (chip
      "obligatorio", sin precio) y del textarea "Observaciones" (canal de variaciones para elaborados,
      placeholder con ejemplos "sin jamón", "sin rúcula").
- [ ] Verificar que agregar una guarnición como producto aparte aparece como línea propia en la cuenta
      (`cuenta-client.tsx`) sin recálculos incorrectos.

## 4. Verify
- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de archivos tocados.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
