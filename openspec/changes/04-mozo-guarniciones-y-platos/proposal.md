# 04-mozo-guarniciones-y-platos — Guarniciones aparte y platos por observación

> Estado: 📋 propuesto · Origen: Reunión §4 (App del Mozo) · §7.5 · §6 · Design: no

## Por qué

En la demo se acordó que **la guarnición nunca va incluida en el plato**: el plato cobra su
precio y la guarnición (papas fritas, puré, ensalada) se toma como **producto individual aparte**.
Hoy el modal del mozo modela las variantes con **grupos de adicionales** (`modifier_groups`), lo que
empuja a meter la guarnición como modificador del plato y rompe el costeo y la comanda.
Además se decidió que los **platos elaborados** (matambito, napolitana, milanesas) no lleven opciones
fijas de guarnición: el mozo aclara variaciones por **observación libre** ("matambito sin rúcula",
"napolitana sin jamón"). La **parrilla** sí conserva el punto de cocción (jugoso / a punto / cocido).

## Qué cambia

- La guarnición deja de ser un adicional del plato: se carga como **otro ítem del pedido**
  (producto individual con su propia comanda y su propio costo).
- Los **platos elaborados** se piden con **observación libre** (sin grupos de adicionales obligatorios
  de guarnición); el textarea "Observaciones" del modal pasa a ser el canal de variaciones.
- La **parrilla** mantiene un grupo de adicionales de **punto de cocción** con 3 opciones
  (jugoso / a punto / cocido), obligatorio y de selección única, sin recargo.
- El modal del mozo deja **visualmente claro** que el punto es elección y la guarnición es un ítem
  aparte (no un add-on del plato).

## Alcance

**Incluye:**
- Convención de catálogo: guarnición = producto en su categoría, **no** modificador.
- Punto de cocción como `modifier_group` único/obligatorio sin recargo (`price_delta_cents = 0`).
- Ajuste del modal de producto (`product-modal.tsx`) para reforzar observación libre en elaborados.
- Validación de que la guarnición agregada como ítem rutea a su sector y suma a la cuenta.

**No incluye (fuera de alcance):**
- Combos "plato + guarnición a precio promo" (queda como futuro; hoy son ítems independientes).
- Sugerir guarnición automáticamente al elegir un plato (UX de upsell, futuro).
- Migrar datos históricos de pedidos que ya tengan guarnición como modificador.

## Impacto

- **Archivos** (reales): `src/components/mozo/product-modal.tsx`,
  `src/lib/mozo/catalog-query.ts`, `src/lib/catalog/schemas.ts`,
  `src/lib/catalog/actions.ts` (validación de convención al guardar producto).
- **Datos:** sin cambios de schema. Es convención de carga + seed del grupo "Punto de cocción".
  Si se decide marcar productos como "guarnición" para reportería, sería una migración
  `0052_product_is_side.sql` (opcional, ver Preguntas abiertas).
- **Tipos:** n/a (sólo si se agrega columna → `pnpm db:types`).
- **Permisos:** n/a (no cambia `src/lib/permissions/can.ts`).
- **Integraciones:** n/a.

## Riesgos

- Carga inconsistente: alguien vuelve a meter guarnición como modificador → mitigación: documentar la
  convención en el editor de catálogo y validar en `catalog/actions.ts` (warning, no bloqueo duro).
- El punto de cocción sin recargo podría confundirse con guarnición → mitigación: copy explícito
  ("Punto de cocción", chip "obligatorio", sin precio) en el modal.

## Preguntas abiertas

- [ ] ¿Conviene una columna `products.is_side boolean` para distinguir guarniciones en analítica y
      en futuros combos, o alcanza con la categoría "Guarniciones"?
- [ ] ¿El punto de cocción aplica sólo a carnes de parrilla o también a algún plato de cocina?
