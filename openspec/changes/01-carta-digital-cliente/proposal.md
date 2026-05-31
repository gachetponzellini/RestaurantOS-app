# 01-carta-digital-cliente — Carta digital del cliente: bebidas, sugerencias del día y dark mode

> Estado: 📋 propuesto · Origen: Reunión §4 (Carta digital/Cliente), §7.2, §7.12, §7.21 · Design: no

## Por qué

En la demo el cliente pidió cuatro ajustes sobre la carta pública (mobile-first) que hoy
ya funciona pero molesta en el uso real:

- Las **bebidas** ocupan una categoría enorme y obligan a un scroll horizontal de tabs muy
  largo; el cliente pidió **agruparlas en un solo slide** para que la carta no se haga tan
  ancha (§7.2).
- El **menú del día** ya existe (migraciones `0017`/`0046`), pero falta poder publicar
  **"Sugerencias del día" (2–3 ítems)** y, sobre todo, **diferenciar lo que se ve en delivery
  vs. en salón**: no siempre son las mismas sugerencias. Se pidió "máxima flexibilidad" con
  slides activables (§7.12).
- Bug menor: la pantalla del cliente que confirma un pedido en **efectivo** mostraba ítems que
  no correspondían al pedido. La causa real es que los **ítems hijos de un combo** del menú del
  día (`is_combo_component = true`, precio 0, agregados por `0046`) se listan junto al producto
  padre en el detalle, ensuciando la lista ("eso se ajusta", §7.4).
- **Dark mode** para el menú público: el local quiere dejar la carta en oscuro (§7.21). El
  sistema de branding ya define `default_mode: light|dark` en `src/lib/branding/tokens.ts`,
  pero `next-themes` todavía no está cableado a la carta pública (hoy sólo lo importa
  `src/components/ui/sonner.tsx`).

## Qué cambia

- La carta agrupa **todas las categorías de bebidas** en una sola sección/slide ("Bebidas"),
  configurable, en lugar de varias tabs separadas (vinos, kiosco, etc. quedan adentro).
- Nuevo tipo de menú del día **"sugerencia"** con un campo **`display_context`**
  (`delivery` | `salon` | `both`) sobre `daily_menus`, que controla en qué superficie se
  muestra. La carta pública filtra por `delivery`/`both`; la operación de salón (mozo) por
  `salon`/`both`.
- El detalle del pedido (confirmación y tracking del cliente) **deja de listar los ítems hijos
  de combo** (`is_combo_component = true`): se muestran como parte del menú padre, no como
  líneas sueltas. Esto corrige el bug de "productos que no correspondían" en la pantalla de
  efectivo.
- La carta pública respeta el **modo (claro/oscuro)** del negocio vía `next-themes` + el token
  `default_mode`, con fondo oscuro de marca (`background_color_dark`).

## Alcance

**Incluye:**
- Agrupación de bebidas en un slide en `src/components/menu/menu-client.tsx` (capa de
  presentación; la fuente de datos es `getMenu` en `src/lib/menu.ts`).
- Campo `display_context` en `daily_menus` + filtro en lectura (`src/lib/menu.ts` /
  `daily-menu-actions.ts`) y en el form admin (`src/components/admin/daily-menus/daily-menu-form.tsx`).
- Marcar las sugerencias como un menú del día con poco peso (badge "Sugerencia") reutilizando
  `DailyMenuSection`/`DailyMenuCard`.
- Filtrado de `is_combo_component` en el detalle del pedido del cliente
  (`src/app/[business_slug]/(public)/confirmacion/[id]/page.tsx` →
  `src/components/checkout/order-tracking.tsx`).
- Dark mode del menú público con `next-themes` + tokens de branding.

**No incluye (fuera de alcance):**
- Rediseño del editor de menús del día más allá del campo `display_context` y el flag de
  sugerencia.
- Cambios en el flujo de combos en sí (cómo se arman los ítems hijos): sólo se ajusta su
  visualización en el detalle del cliente.
- Carga del manual de marca / fuentes reales del cliente (eso es del cambio de branding, §7.21).
- Dark mode del panel de administración (este cambio cubre sólo la **carta pública**).

## Impacto

- **Archivos** (reales):
  - `src/components/menu/menu-client.tsx`, `src/components/menu/daily-menu-section.tsx`,
    `src/components/menu/daily-menu-sheet.tsx` (agrupación bebidas + badge sugerencia).
  - `src/lib/menu.ts` (lectura del catálogo y de menús del día con filtro por contexto).
  - `src/lib/daily-menus/daily-menu-actions.ts`, `src/lib/daily-menus/schemas.ts` (nuevo campo).
  - `src/components/admin/daily-menus/daily-menu-form.tsx` (selector delivery/salón/ambos + sugerencia).
  - `src/app/[business_slug]/(public)/confirmacion/[id]/page.tsx`,
    `src/components/checkout/order-tracking.tsx` (ocultar ítems hijos de combo).
  - `src/app/[business_slug]/(public)/layout.tsx` (provider de tema) y consumo de
    `src/lib/branding/tokens.ts` (`default_mode`, `background_color_dark`).
- **Datos:** nueva migración `supabase/migrations/0052_daily_menu_display_context.sql`:
  `alter table public.daily_menus add column display_context text not null default 'both'
  check (display_context in ('delivery','salon','both'))` + flag `is_suggestion boolean not null
  default false`. RLS: ninguna policy nueva (hereda las de `0017_daily_menus.sql`, scope por
  `business_id` vía `is_business_member`).
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** sin cambios (crear/editar menús del día ya es de admin/encargado; ver carta es
  público).
- **Integraciones:** n/a.

## Riesgos

- **Filtro de contexto mal aplicado** → una sugerencia de salón se filtra en delivery y
  viceversa. Mitigación: default `both` (comportamiento actual preservado) y tests de
  `src/lib/menu.ts` cubriendo los tres valores.
- **Ocultar ítems hijos de combo podría esconder info útil** si algún negocio los usa como
  líneas vendibles. Mitigación: el filtro aplica sólo a `is_combo_component = true`
  (precio 0, generados por `0046`), nunca a productos normales; los componentes del combo
  siguen visibles vía `daily_menu_snapshot.components`.
- **Dark mode con colores de marca insuficientes** (texto ilegible). Mitigación: usar los
  tokens existentes `background_color_dark`/foregrounds de `BRANDING_DEFAULTS` y validar
  contraste antes de activar por negocio.

## Preguntas abiertas

- [ ] ¿"Bebidas" agrupa **todas** las categorías marcadas como bebidas (vinos, kiosco, varios)
      o sólo las explícitamente bebibles? ¿Hace falta un flag por categoría o alcanza con una
      lista configurable por negocio?
- [ ] ¿El dark mode es **fijo por negocio** (lo elige el local) o el cliente final puede
      togglear? La reunión sugiere fijo ("se deja oscuro para el local").
- [ ] ¿Las sugerencias del día comparten precio/compra como un menú del día, o son sólo
      "destacados" sin carrito? (afecta si reusamos `daily_menus` o sólo su UI).
