# Feature Specification: Carga de pedido por teclado en el sidebar del salón

**Feature Branch**: `055-carga-pedido-teclado`

**Created**: 2026-07-23

**Status**: 🚧 Implementado (2026-07-23) — `pnpm typecheck` + `pnpm test` (772+ verde; el único rojo es el integration flaky de cloud `billing/cuenta`, ajeno, que pasa con timeout holgado) + `pnpm build` en verde. **Pendiente:** verify en vivo con rol real (encargado, sidebar del salón) — T018. Aprobado por Juan (2026-07-23). Issue [#81](https://github.com/gachetponzellini/RestaurantOS-app/issues/81). Milestone: Post-demo · Growth & hardening.

**Input**: Pedido de Juan (2026-07-23) — "acomodar el sidebar para cargar pedidos a una mesa en la operación: lo más sencillo posible, que vaya mostrando los artículos que van agregando, el buscador fijo arriba (siempre buscan por ahí), que cargar sea bien mecánico —sin mover el mouse se pueda cargar un pedido entero de varios artículos—, que muestre lo que ya cargó, menos énfasis a las categorías, optimizar el espacio, y que solo con teclas se pueda cargar el pedido".

**Issue**: [#81](https://github.com/gachetponzellini/RestaurantOS-app/issues/81)

## Contexto y problema

Cargar un pedido a una mesa desde la operación pasa por **un solo componente**: `MozoPedirClient` (`src/app/[business_slug]/mozo/mesa/[id]/pedir/pedir-client.tsx`, ~1890 líneas). Se renderiza de dos formas con el prop `embedded`:

- **Full-screen** (app del mozo, tablet, táctil): ruta `mozo/mesa/[id]/pedir`.
- **Embebido (`embedded`) = el "sidebar" del salón**: montado en `src/components/admin/local/salon-desktop.tsx` (~línea 1006) como `<MozoPedirClient embedded onClose onSent />`, y reusado por el admin en `admin/(authed)/mesa/[id]/pedir`. Corre en la **PC del salón, con teclado físico**.

Hoy ese sidebar tiene fricciones que hacen la carga lenta y dependiente del mouse:

1. **El buscador no está fijo.** El input de búsqueda (`CatalogoStep`) vive dentro del `<main>` que scrollea, **por debajo** del header sticky de categorías, y **no** recibe foco al abrir. Como buscar por nombre es la vía principal de carga, tenerlo móvil y sin foco es fricción en cada ítem.
2. **Flujo de 2 pasos** (`step: "catalogo" | "resumen"`). El pedido en armado vive en un paso **aparte** (`ResumenStep`) al que hay que navegar; **no se ve** mientras se cargan ítems. No hay feedback continuo de "lo que van agregando".
3. **Las categorías dominan el espacio.** Tabs de super-categoría (sticky en el header) + secciones por categoría + nav prev/next en el footer ocupan el chrome del panel, aun cuando en el salón se busca casi siempre por nombre.
4. **Cero soporte de teclado.** No hay un solo `onKeyDown`/`focus()`/`tabIndex` en todo el flujo (verificado). El alta de ítem abre `ProductModal` (`src/components/mozo/product-modal.tsx`), un overlay custom que **no cierra con Esc, no atrapa el foco y no es un `<form>`** (la [spec 043](../043-navegabilidad-operacion-encargado/spec.md) migró los modales del admin pero dejó explícitamente los del mozo para su propia línea). Cargar un pedido de varios ítems obliga a ir y volver al mouse por cada uno.

Esta feature es un **rediseño de la ergonomía de carga**, keyboard-first, **acotado al sidebar del salón**. No toca `enviarComanda`, el ruteo a cocina, plata ni estados. Es la contraparte "ergonomía" de la línea de performance percibida (specs [039](../039-fundaciones-perf-percibida/spec.md)/[041](../041-mozo-instantaneo/spec.md), que atacaron la latencia de red).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cargar varios ítems seguidos sin tocar el mouse (Priority: P1)

Como encargado en la PC del salón, abro el sidebar de una mesa y cargo un pedido entero de varios artículos usando **solo el teclado**: el foco ya está en el buscador, tipeo, elijo con las flechas, confirmo, y el foco vuelve al buscador listo para el siguiente. Nunca suelto el teclado.

**Why this priority**: Es el objetivo central de la feature ("bien mecánico, sin mover el mouse, cargar un pedido entero solo con teclas"). Es lo que cambia la sensación de velocidad en hora pico.

**Independent Test**: En el sidebar del salón, abrir la carga de una mesa y cargar 3 ítems (dos por búsqueda + Enter, uno con modificadores) sin tocar el mouse en ningún momento, terminando con el pedido de 3 líneas visible.

**Acceptance Scenarios**:

1. **Dado** que abro el sidebar de carga en el salón, **Cuando** aparece, **Entonces** el foco está en el buscador (puedo tipear sin clickear).
2. **Dado** el foco en el buscador con resultados listados, **Cuando** presiono ↓/↑, **Entonces** se mueve la selección entre los resultados sin mover el mouse; **Cuando** presiono Enter, **Entonces** se activa el resultado seleccionado (abre su modal de alta).
3. **Dado** que agregué un ítem, **Cuando** vuelvo al catálogo, **Entonces** el foco regresa al buscador **limpio**, listo para el próximo ítem (encadenar cargas).
4. **Dado** una búsqueda con un **único** resultado, **Cuando** presiono Enter, **Entonces** se abre ese ítem directamente (sin obligar a bajar con ↓).
5. **Dado** una búsqueda **sin** resultados, **Cuando** presiono Enter, **Entonces** no pasa nada (no hay ítem que abrir) y se ve el mensaje de "sin resultados".

---

### User Story 2 - El pedido en armado siempre a la vista (Priority: P1)

Como quien carga, quiero ver la lista de lo que voy agregando **mientras** cargo, sin ir a un paso "Resumen" aparte, para no perder el hilo ni cargar de más/de menos.

**Why this priority**: Pedido explícito ("que vaya mostrando los artículos que van agregando", "que muestre lo que ya cargó"). El feedback continuo es la mitad de la sensación de "mecánico".

**Independent Test**: Con el sidebar abierto, agregar dos ítems y verificar que ambos aparecen al instante en una lista de pedido visible (con cantidad y subtotal) sin haber navegado a otra pantalla.

**Acceptance Scenarios**:

1. **Dado** el sidebar de carga abierto, **Cuando** miro la vista, **Entonces** veo simultáneamente el buscador, los resultados/catálogo **y** el pedido en armado (no hay que cambiar de paso para ver el carrito).
2. **Dado** que agrego un ítem, **Cuando** se confirma, **Entonces** aparece de inmediato en la lista del pedido, con su cantidad, subtotal y el total actualizado.
3. **Dado** un ítem ya en el pedido, **Cuando** ajusto su cantidad o lo quito, **Entonces** el cambio se refleja al instante y esas acciones son alcanzables por teclado.
4. **Dado** un pedido vacío, **Cuando** miro la zona del pedido, **Entonces** hay un estado vacío claro (no un bloque en blanco ambiguo).

---

### User Story 3 - El modal de producto, 100% operable por teclado (Priority: P2)

Como quien carga, cuando un producto abre su modal (cantidad, modificadores/guarnición, "como entrada", notas), quiero completarlo y agregarlo **con el teclado**: foco al abrir, Tab entre controles, Enter agrega, Esc cierra.

**Why this priority**: Sin esto, la cadena "solo con teclas" se corta en cada producto con opciones. Es P2 porque depende del layout de US1/US2 y porque la decisión de producto es **mantener el modal siempre** (no bypassear para productos simples), haciéndolo accesible.

**Independent Test**: Abrir el modal de un producto con modificadores requeridos usando solo teclado, elegir una opción, presionar Enter y verificar que se agrega; repetir presionando Esc y verificar que **no** se agrega.

**Acceptance Scenarios**:

1. **Dado** que abro un `ProductModal`, **Cuando** aparece, **Entonces** el foco va al primer control accionable (o al botón "Agregar al pedido" si el producto no tiene modificadores).
2. **Dado** el modal abierto, **Cuando** presiono Esc, **Entonces** se cierra **sin** agregar (equivale a cancelar) y el foco vuelve al buscador.
3. **Dado** un producto **sin** modificadores, **Cuando** presiono Enter, **Entonces** se agrega con cantidad 1 (o la elegida) sin pasos extra.
4. **Dado** un producto **con** modificadores requeridos sin elegir, **Cuando** presiono Enter, **Entonces** se muestra el error de validación existente y **no** se agrega (Enter no saltea `validate`).
5. **Dado** el foco en el `<textarea>` de notas, **Cuando** presiono Enter, **Entonces** inserta salto de línea y **no** envía (comportamiento nativo preservado; el submit por Enter es desde los otros campos).

---

### User Story 4 - El buscador manda, las categorías ceden espacio (Priority: P2)

Como quien carga en el salón (conoce la carta), quiero que el buscador sea el protagonista y que las categorías ocupen menos, dejando más espacio para resultados y pedido — sin perder la posibilidad de explorar por categoría cuando no recuerdo el nombre.

**Why this priority**: Pedido explícito ("menos énfasis a las categorías", "optimizar el espacio"). Habilita el layout de US2 (pedido visible) en una columna angosta.

**Independent Test**: Abrir el sidebar y verificar que el buscador es el elemento primario y fijo; que las categorías están presentes pero en un control secundario/compacto; y que la navegación por categoría sigue accesible.

**Acceptance Scenarios**:

1. **Dado** el sidebar abierto, **Cuando** lo miro, **Entonces** el buscador es el elemento primario y fijo arriba; las categorías tienen menos peso visual/espacial que hoy (ya no dominan header + footer).
2. **Dado** que no recuerdo el nombre de un producto, **Cuando** uso el control de categorías (secundario), **Entonces** puedo explorar sus productos como hoy.
3. **Dado** el layout de columna angosta, **Cuando** hay resultados y pedido a la vez, **Entonces** ninguno tapa al otro (el espacio vertical está optimizado: buscador fijo / resultados con scroll / pedido).

---

### User Story 5 - Enviar la comanda por teclado (Priority: P3)

Como quien terminó de cargar, quiero enviar la comanda completa sin ir al mouse, cerrando el flujo "solo con teclas" de punta a punta.

**Why this priority**: Completa la cadena keyboard-first, pero es P3 porque el envío ya existe y es de menor frecuencia que agregar ítems; el riesgo (plata/cocina) exige respetar el anti-doble-envío existente.

**Independent Test**: Con un pedido cargado, disparar el envío por teclado y verificar que se manda una sola comanda; repetir el disparo mientras está en vuelo y verificar que no se reenvía.

**Acceptance Scenarios**:

1. **Dado** un pedido con al menos un ítem, **Cuando** uso el atajo de enviar, **Entonces** se dispara el mismo `enviarComanda` que el botón (misma validación y ruteo).
2. **Dado** que el envío ya está en vuelo (`isPending`), **Cuando** vuelvo a disparar, **Entonces** **no** se reenvía (respeta el anti-doble-envío / idempotencia de las specs [041](../041-mozo-instantaneo/spec.md)/[042](../042-enviar-comanda-idempotente/spec.md)).
3. **Dado** un pedido **vacío**, **Cuando** intento enviar, **Entonces** la acción está deshabilitada / no hace nada.

### Edge Cases

- **Autofocus en la tablet del mozo**: en full-screen táctil, dar foco automático al buscador abriría el teclado virtual tapando media pantalla. El autofocus **debe** activarse solo en el modo `embedded`/desktop, no en full-screen.
- **Colisión de flechas**: si el foco está en un stepper de cantidad del pedido, ↑/↓ no deben mover a la vez la selección de resultados del buscador (el manejo de flechas se scopea al buscador/lista de resultados).
- **Foco huérfano tras cerrar el modal**: cerrar con Esc o agregar debe devolver el foco a un lugar definido (el buscador), nunca dejarlo en el `<body>`.
- **Resultado seleccionado que desaparece**: si sigo tipeando y el ítem resaltado deja de matchear, la selección se resetea al primero de la nueva lista (Enter no abre un ítem que ya no está).
- **Modal dentro de columna angosta**: en `embedded`, el overlay del modal se scopea al panel (`absolute`), no al viewport (`fixed`) — comportamiento actual a preservar.
- **Sin regresión táctil**: todo lo anterior no debe romper la carga por tap del mozo full-screen (los atajos de teclado conviven sin estorbar).

## Requirements *(mandatory)*

### Functional Requirements

**Buscador fijo y con foco (US1, US4)**

- **FR-001 (MODIFIED)**: El buscador de productos DEBE quedar **fijo** en el tope del panel de carga (por encima de resultados y pedido), visible aunque se scrollee la lista. *(Hoy scrollea dentro del `<main>`.)*
- **FR-002 (ADDED)**: Al abrir el panel de carga en modo `embedded` (sidebar del salón), el foco DEBE ir automáticamente al buscador. En modo full-screen táctil (mozo) el autofocus NO se aplica (evita abrir el teclado virtual).
- **FR-003 (ADDED)**: Con el foco en el buscador, ↓/↑ DEBEN mover la selección entre los resultados listados y Enter DEBE activar (abrir el modal de) el resultado seleccionado, todo sin mouse. El manejo de teclas se acota al buscador/lista de resultados.
- **FR-004**: La búsqueda DEBE seguir siendo global por nombre, case-insensitive (comportamiento actual, sin regresión); mejorar el matching (fuzzy/ranking) queda fuera de alcance.

**Pedido en armado visible (US2)**

- **FR-005 (MODIFIED)**: El pedido en armado (carrito) DEBE estar visible en la **misma** vista durante la carga, sin navegar a un paso "Resumen" separado, mostrando cada línea con cantidad y subtotal y el total del pedido. *(Hoy vive en `step: "resumen"`.)*
- **FR-006 (MODIFIED)**: Agregar un ítem DEBE reflejarse de inmediato en esa lista visible (feedback continuo).
- **FR-007**: Ajustar cantidad y quitar una línea del pedido DEBEN ser alcanzables por teclado y reflejarse al instante.
- **FR-008**: La zona del pedido DEBE tener un estado vacío claro cuando no hay ítems.

**Modal de producto por teclado (US3)**

- **FR-009 (MODIFIED)**: El `ProductModal` DEBE cerrarse con Esc y atrapar el foco (focus-trap), adoptando el `Dialog`/`Sheet` compartido (convención [spec 043](../043-navegabilidad-operacion-encargado/spec.md), Base UI) o un equivalente que provea Esc + focus-trap, preservando su modo `embedded` (overlay `absolute`).
- **FR-010 (ADDED)**: Al abrir el modal, el foco DEBE ir al primer control accionable, o al botón "Agregar al pedido" si el producto no tiene modificadores.
- **FR-011 (MODIFIED)**: El modal DEBE estructurarse como `<form onSubmit>` con "Agregar al pedido" en `type="submit"`, de modo que Enter agregue el ítem pasando por la validación de modificadores existente (`validate`); los controles no-primarios (steppers, chips, cerrar) quedan `type="button"`.
- **FR-012**: Cerrar el modal con Esc NO DEBE agregar el ítem (equivale a cancelar); el `<textarea>` de notas DEBE preservar Enter = salto de línea.
- **FR-013 (ADDED)**: Tras agregar un ítem (por Enter o click) o cerrar el modal, el foco DEBE volver al buscador, listo para el próximo ítem.

**Categorías y espacio (US4)**

- **FR-014 (MODIFIED)**: Las categorías DEBEN tener menor peso visual/espacial que hoy (dejan de ocupar header + footer como navegación primaria); el buscador es el elemento primario. El acceso por categoría se conserva en un control secundario/compacto para explorar sin nombre.
- **FR-015**: El layout del panel `embedded` DEBE optimizar el espacio vertical de la columna angosta de modo que buscador (fijo), resultados (scroll) y pedido convivan sin taparse.

**Enviar por teclado (US5)**

- **FR-016 (ADDED)**: DEBE existir una forma de enviar la comanda completa por teclado (atajo), que dispare el mismo `enviarComanda` y respete el anti-doble-envío/idempotencia existente (un segundo disparo en vuelo no reenvía); con el pedido vacío la acción no hace nada.

**Sin regresión (todas)**

- **FR-017**: En modo full-screen (mozo, táctil) NO DEBE haber regresión: la carga por tap sigue funcionando, los cambios de layout se degradan bien y los atajos de teclado no estorban.

**Fast-follow — pedido de Juan (2026-07-23, post-implementación)**

- **FR-018 (ADDED)**: En el `ProductModal`, las teclas `+` (o `=`) y `−` DEBEN aumentar/disminuir la cantidad (respetando el rango 1–99), salvo cuando el foco está en el campo Observaciones (ahí `+`/`−` se escriben). Permite cargar varias unidades (ej. agua) sin ir al mouse.
- **FR-019 (ADDED)**: El pedido en armado (carrito) DEBE persistirse como **borrador local por mesa+negocio** (`localStorage`, key `mozo-cart:{slug}:{tableId}`), de modo que si se sale de la carga (p. ej. a editar el precio de una sugerencia) y se vuelve, se retoma en vez de perderse. El borrador **no es plata** (ítems sin enviar) y se limpia al enviar todo (carrito vacío). Es local al dispositivo (no se comparte entre browsers). Sigue siendo `useState` (no se migra a Zustand); la persistencia es un efecto sobre `localStorage`.

### Non-Goals (fuera de alcance)

- Tocar `enviarComanda`, el ruteo a cocina/estaciones, la plata, los estados de mesa/comanda o ARCA.
- Mostrar lo **ya enviado** a cocina en esta mesa (comandas previas): esta feature muestra solo el **carrito en armado**.
- Migrar el mozo full-screen (tablet) a un layout distinto: solo hereda las mejoras que aplican en táctil, sin rediseño propio.
- Mover el carrito a Zustand (el borrador se persiste en `localStorage` vía efecto, ver FR-019 — el estado sigue en `useState`).
- Compartir el borrador entre dispositivos/usuarios (es local al browser) o persistirlo server-side.
- Cambiar el criterio de búsqueda (sigue por nombre); fuzzy/ranking/atajos tipo Cmd+K quedan fuera.
- Datos / migración / RLS / permisos: **cero cambios**.

### Key Entities

Sin entidades ni migraciones. Reutiliza: el carrito `useState<CartItem[]>` de `pedir-client.tsx`, la server action `enviarComanda` (`src/lib/comandas/actions.ts`), el `ProductModal` (`src/components/mozo/product-modal.tsx`) y la lógica pura de notas `composeItemNotes` (`src/lib/mozo/item-notes.ts`, spec 050). Puro UI.

## Success Criteria *(mandatory)*

- **SC-001**: En el sidebar del salón, un encargado carga un pedido de N ítems (con y sin modificadores) usando **solo el teclado**, de punta a punta (abrir → buscar → agregar × N → enviar), sin tocar el mouse.
- **SC-002**: El buscador queda fijo y con foco al abrir (en `embedded`); escribir + ↑/↓ + Enter selecciona y abre resultados sin mouse.
- **SC-003**: El pedido en armado se ve siempre durante la carga; cada ítem agregado aparece al instante con cantidad, subtotal y total.
- **SC-004**: El `ProductModal` cierra con Esc (sin agregar), agrega con Enter respetando la validación de modificadores, y el foco vuelve al buscador tras cada alta.
- **SC-005**: Las categorías ocupan menos espacio que hoy y el buscador es primario, sin perder el acceso por categoría; el espacio vertical de la columna alcanza para resultados + pedido.
- **SC-006**: Cero regresión en el mozo full-screen (táctil) y en `enviarComanda` (sin doble-envío).
- **SC-007**: `pnpm typecheck` + `pnpm test` + `pnpm build` en verde; verificado **en vivo con el rol real** (encargado, en el sidebar del salón).

## Assumptions

- El panel `embedded` (`salon-desktop.tsx`) corre en la PC del salón, con teclado físico; el modo full-screen corre en tablet táctil sin teclado.
- El `Dialog`/`Sheet` compartido (Base UI) ya trae Esc + focus-trap (verificado en la spec 043); el `ProductModal` puede migrarse a él o replicar esas garantías preservando su overlay `absolute` en `embedded`.
- El carrito sigue siendo `useState` efímero; su persistencia queda fuera de alcance.
- La columna del sidebar es angosta (~`max-w-md`): el "pedido siempre visible" se resuelve **verticalmente** (buscador fijo / resultados / pedido), no en dos columnas. El layout concreto se fija en el [plan](./plan.md).
- Se reutiliza la validación de modificadores y `composeItemNotes` sin cambios de contrato.
- La navegación por teclado (flechas/Enter/Esc) no es barata de unit-testear; su verificación es en vivo (SC-002/004). La lógica pura extraíble (selección de resultado por índice, clamp, reset al re-buscar) sí se cubre con unit tests (TDD).
