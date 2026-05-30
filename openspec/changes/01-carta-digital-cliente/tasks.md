# Tareas — 01-carta-digital-cliente Carta digital del cliente: bebidas, sugerencias del día y dark mode

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.

## 1. Datos

- [ ] Migración `supabase/migrations/0052_daily_menu_display_context.sql`:
      `alter table public.daily_menus add column display_context text not null default 'both'
      check (display_context in ('delivery','salon','both'))` + `add column is_suggestion boolean
      not null default false`.
- [ ] Verificar que NO hace falta policy RLS nueva: `daily_menus` hereda las de
      `0017_daily_menus.sql` (scope por `business_id` vía `is_business_member`).
- [ ] `pnpm db:types` → regenerar `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)

- [ ] Test (rojo): `src/lib/menu.test.ts` (o co-ubicado) cubriendo el filtro por
      `display_context` para los tres valores (`delivery`, `salon`, `both`) en la lectura de
      menús del día, incluyendo aislamiento por `business_id`.
- [ ] Implementar el filtro por contexto en `src/lib/menu.ts` (lectura de la carta pública:
      sólo `delivery`/`both`).
- [ ] Implementar el filtro por contexto en `src/lib/daily-menus/daily-menu-actions.ts`
      (lectura de salón: sólo `salon`/`both`).
- [ ] Extender el schema Zod en `src/lib/daily-menus/schemas.ts` (`DailyMenuInput`) con
      `display_context` (enum `delivery|salon|both`, default `both`) e `is_suggestion`
      (boolean, default `false`); validar en la Server Action de crear/editar.

## 3. UI

- [ ] Agrupación de bebidas en un único slide "Bebidas" en
      `src/components/menu/menu-client.tsx` (capa de presentación sobre `getMenu`).
- [ ] Badge "Sugerencia" en `src/components/menu/daily-menu-section.tsx`
      (`DailyMenuSection`/`DailyMenuCard`) para `is_suggestion = true`.
- [ ] Selector delivery/salón/ambos + toggle "Sugerencia" en el form admin
      `src/components/admin/daily-menus/daily-menu-form.tsx`.
- [ ] Ocultar ítems hijos de combo (`is_combo_component = true`) en el detalle del cliente:
      ajustar la lectura en `src/app/[business_slug]/(public)/confirmacion/[id]/page.tsx` y el
      render en `src/components/checkout/order-tracking.tsx`.
- [ ] Cablear `next-themes` en `src/app/[business_slug]/(public)/layout.tsx` consumiendo
      `default_mode` y `background_color_dark` de `src/lib/branding/tokens.ts`.

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Validar contraste del dark mode con los tokens de marca antes de activar por negocio.
- [ ] Revisión fresca de los archivos tocados.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
