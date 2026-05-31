# Spec — 04-mozo-guarniciones-y-platos Guarniciones aparte y platos por observación

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.

## ADDED Requirements

### Requisito: Cargar la guarnición como producto individual
El sistema DEBE permitir que la guarnición se agregue al pedido como **ítem propio** (producto de la
categoría correspondiente), independiente del plato, con su precio, su sector de comanda y su costo.

#### Escenario: Mozo agrega papas fritas aparte de la milanesa
- **Dado** un pedido en una mesa con una "Milanesa" ya cargada (precio propio)
- **Cuando** el mozo agrega "Papas fritas" desde el catálogo como otro ítem
- **Entonces** la cuenta muestra dos líneas (milanesa y papas), cada una con su precio
- **Y** cada ítem rutea a su sector de comanda (cocina / fritera) según `station_id` del producto

#### Escenario: La guarnición no aparece como adicional del plato
- **Dado** el modal de un plato elaborado abierto en la app del mozo
- **Cuando** el mozo revisa los grupos de adicionales del plato
- **Entonces** no existe un grupo "Guarnición" dentro del plato
- **Y** para sumar guarnición el mozo debe elegirla como producto aparte

### Requisito: Conservar el punto de cocción en parrilla
El sistema DEBE ofrecer en los productos de parrilla un grupo de adicionales **"Punto de cocción"**
**obligatorio**, de **selección única**, con exactamente las opciones **jugoso / a punto / cocido** y
**sin recargo** (`price_delta_cents = 0`).

#### Escenario: Mozo marca el punto de un bife
- **Dado** el modal de un "Bife de chorizo" (producto de parrilla)
- **Cuando** el mozo abre el grupo "Punto de cocción"
- **Entonces** ve las tres opciones jugoso / a punto / cocido como selección única obligatoria
- **Y** el precio del ítem no cambia al elegir el punto
- **Y** no puede agregar el ítem sin elegir un punto

#### Escenario: El punto viaja en la comanda de parrilla
- **Dado** un bife con punto "a punto" agregado al pedido
- **Cuando** el ítem se envía a comanda
- **Entonces** la comanda de parrilla muestra el punto "a punto" como modificador del ítem

## MODIFIED Requirements

### Requisito: Variaciones de platos elaborados por observación libre
Hoy las variaciones se modelan con grupos de adicionales. El comportamiento cambia: los **platos
elaborados** DEBEN tomar sus variaciones por **observación libre** (campo "Observaciones" del modal,
máx. 200 caracteres), sin grupos de adicionales obligatorios de guarnición o ingredientes.

#### Escenario: Mozo aclara "napolitana sin jamón"
- **Dado** el modal de una "Milanesa napolitana" (plato elaborado)
- **Cuando** el mozo escribe "sin jamón" en Observaciones y agrega el ítem
- **Entonces** la observación queda asociada al ítem del pedido
- **Y** la observación viaja en la comanda hacia cocina

#### Escenario: La observación se trunca a 200 caracteres
- **Dado** el campo Observaciones del modal de producto
- **Cuando** el mozo pega un texto de más de 200 caracteres
- **Entonces** el sistema conserva sólo los primeros 200 caracteres

## REMOVED Requirements

### Requisito: Guarnición como grupo de adicionales incluido en el plato
Se elimina la práctica de modelar la guarnición como `modifier_group` dentro del plato (con o sin
recargo). La guarnición ya **no** se incluye en el plato: el plato cobra su precio y la guarnición es
un producto aparte. Esto evita que el costeo y la comanda mezclen plato y guarnición en una sola línea.
