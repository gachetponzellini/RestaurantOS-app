/**
 * Composición de la observación de un ítem del pedido del mozo/encargado.
 *
 * Spec 050: el atajo "Como entrada" no agrega un campo nuevo — se compone con el
 * texto libre de Observaciones y viaja por el pipeline existente `notes`
 * (`enviarComanda` → `order_items.notes` → comanda del kanban + ticket impreso).
 */

/** Marcador que se antepone a la observación cuando el ítem va como entrada. */
export const ENTRADA_MARKER = "Como entrada";

const SEPARATOR = " · ";
const MAX_LEN = 200;

/**
 * Combina el flag "como entrada" con el texto libre de observaciones.
 * El marcador queda siempre al frente (para que sea lo primero que ve cocina) y
 * el resultado se trunca a 200 caracteres.
 */
export function composeItemNotes(input: {
  asEntrada: boolean;
  freeText: string;
}): string {
  const free = input.freeText.trim();
  const composed = input.asEntrada
    ? free
      ? `${ENTRADA_MARKER}${SEPARATOR}${free}`
      : ENTRADA_MARKER
    : free;
  return composed.slice(0, MAX_LEN);
}
