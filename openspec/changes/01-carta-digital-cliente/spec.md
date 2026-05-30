# Spec — 01-carta-digital-cliente Carta digital del cliente: bebidas, sugerencias del día y dark mode

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.

## ADDED Requirements

### Requisito: Agrupar las bebidas en un único slide de la carta

El sistema DEBE presentar todas las categorías de bebidas del negocio dentro de una sola
sección/tab "Bebidas" en la carta pública, en lugar de una tab por categoría, para evitar el
scroll horizontal largo. La agrupación es de presentación: la fuente de datos (`getMenu` en
`src/lib/menu.ts`) no cambia su estructura de categorías.

#### Escenario: Carta con varias categorías de bebidas

- **Dado** un negocio con categorías "Vinos", "Kiosco" y "Gaseosas" marcadas como bebidas y
  categorías "Entradas" y "Principales" que no lo son
- **Cuando** el cliente abre la carta pública en `src/components/menu/menu-client.tsx`
- **Entonces** ve una sola tab "Bebidas" (además de "Entradas" y "Principales") y, al entrar,
  los productos de "Vinos", "Kiosco" y "Gaseosas" aparecen agrupados bajo subtítulos dentro de
  esa misma sección, sin tabs separadas por cada una

#### Escenario: Negocio sin categorías de bebidas

- **Dado** un negocio cuyo catálogo no tiene ninguna categoría marcada como bebida
- **Cuando** el cliente abre la carta pública
- **Entonces** no se renderiza la tab "Bebidas" y el resto de las categorías se muestra normal,
  sin secciones vacías

### Requisito: Filtrar sugerencias del día por contexto de visualización (delivery / salón)

El sistema DEBE permitir que un menú del día marcado como sugerencia se muestre sólo en la
superficie configurada mediante el campo `display_context` (`delivery` | `salon` | `both`) de
`daily_menus`. La carta pública (cliente) DEBE listar únicamente los menús del día con
`display_context` en (`delivery`, `both`); la operación de salón (mozo) los de (`salon`, `both`).
El filtro se aplica en lectura (`src/lib/menu.ts` y `src/lib/daily-menus/daily-menu-actions.ts`)
y respeta el scope `business_id` + RLS heredado de `0017_daily_menus.sql`.

#### Escenario: Sugerencia sólo para delivery no aparece en salón

- **Dado** una sugerencia del día con `is_suggestion = true` y `display_context = 'delivery'`
  del negocio actual
- **Cuando** el cliente abre la carta pública (superficie delivery/retiro)
- **Entonces** la sugerencia aparece en la carta
- **Y** cuando el mozo abre la vista de salón del mismo negocio, esa sugerencia no aparece

#### Escenario: Sugerencia para ambas superficies

- **Dado** una sugerencia con `display_context = 'both'`
- **Cuando** se consulta tanto la carta pública como la vista de salón
- **Entonces** la sugerencia aparece en ambas superficies

#### Escenario: Aislamiento multi-tenant

- **Dado** una sugerencia con `display_context = 'both'` que pertenece a otro negocio
- **Cuando** el cliente abre la carta pública del negocio actual
- **Entonces** esa sugerencia de otro negocio no aparece (scope `business_id` + RLS)

### Requisito: Marcar las sugerencias del día con un distintivo "Sugerencia"

El sistema DEBE mostrar los menús del día con `is_suggestion = true` reutilizando
`DailyMenuSection`/`DailyMenuCard` (`src/components/menu/daily-menu-section.tsx`) con un badge
"Sugerencia" que los diferencie del menú del día principal, sin duplicar componentes.

#### Escenario: Sugerencia con badge

- **Dado** una sugerencia del día activa y disponible para la superficie consultada
- **Cuando** el cliente la ve en la carta pública
- **Entonces** la tarjeta muestra el badge "Sugerencia" y conserva nombre, precio (en centavos,
  formateado vía `src/lib/currency.ts`) y disponibilidad del menú del día

### Requisito: Respetar el modo claro/oscuro del negocio en la carta pública

El sistema DEBE aplicar el modo de color (claro/oscuro) definido por el negocio en el token
`default_mode` de `src/lib/branding/tokens.ts`, cableando `next-themes` en el layout público
(`src/app/[business_slug]/(public)/layout.tsx`) y usando el color de fondo de marca
`background_color_dark` cuando el modo es oscuro.

#### Escenario: Negocio configurado en oscuro

- **Dado** un negocio con `default_mode = 'dark'` en sus tokens de branding
- **Cuando** el cliente abre la carta pública
- **Entonces** la carta se renderiza en modo oscuro con el fondo `background_color_dark` de la
  marca y texto legible (foregrounds de los tokens)

#### Escenario: Negocio configurado en claro (default)

- **Dado** un negocio con `default_mode = 'light'` (valor por defecto de `BRANDING_DEFAULTS`)
- **Cuando** el cliente abre la carta pública
- **Entonces** la carta se renderiza en modo claro, sin cambios respecto al comportamiento actual

## MODIFIED Requirements

### Requisito: Ocultar los ítems hijos de combo en el detalle del pedido del cliente

Hoy el detalle del pedido del cliente (confirmación y tracking) lista todas las filas de
`order_items`, incluidos los ítems hijos de un combo del menú del día
(`is_combo_component = true`, precio 0, generados por `0046`), lo que ensucia la lista y produjo
el bug de "productos que no correspondían" en la pantalla de pago en efectivo. El sistema DEBE
dejar de listar como líneas sueltas los ítems con `is_combo_component = true`; éstos se entienden
como parte del menú padre. El cambio aplica en la lectura de
`src/app/[business_slug]/(public)/confirmacion/[id]/page.tsx` y en el render de
`src/components/checkout/order-tracking.tsx`. No se modifica cómo se arman los combos.

#### Escenario: Pedido con un combo del menú del día (pantalla de efectivo)

- **Dado** un pedido confirmado que contiene un menú del día tipo combo con 3 ítems hijos
  (`is_combo_component = true`, `unit_price_cents = 0`) y 1 producto normal
- **Cuando** el cliente ve la pantalla de confirmación del pedido en efectivo
- **Entonces** la lista muestra el menú del día padre y el producto normal, pero no muestra los
  3 ítems hijos como líneas sueltas
- **Y** el total del pedido no cambia (los hijos ya valían 0)

#### Escenario: Pedido sin combos

- **Dado** un pedido con sólo productos normales (`is_combo_component = false`)
- **Cuando** el cliente ve el detalle del pedido
- **Entonces** se listan todos los productos tal como hoy, sin ocultar ninguno

#### Escenario: Componentes del combo siguen visibles vía snapshot

- **Dado** el mismo pedido con un combo del menú del día
- **Cuando** el cliente abre el detalle del menú del día padre
- **Entonces** los componentes del combo siguen visibles a través de
  `daily_menu_snapshot.components` (no se pierde información), sólo se evitan las líneas sueltas
