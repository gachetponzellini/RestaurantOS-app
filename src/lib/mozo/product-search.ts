/**
 * Lógica pura de selección de resultado en el buscador de productos del panel
 * de carga (spec 055 — carga de pedido por teclado). Aislada de React/DOM para
 * poder testearla (TDD): el componente mantiene un `selectedIndex` sobre la
 * lista de resultados y usa estas funciones para moverlo con el teclado (↓/↑) y
 * resetearlo al cambiar la búsqueda.
 *
 * Convención: el índice es `-1` cuando no hay resultados (sin selección
 * posible); en una lista no vacía siempre queda dentro de `[0, length-1]`
 * (clamp, sin wrap-around).
 */

/** Acota `index` a un índice válido dentro de una lista de `length` elementos.
 *  Devuelve `-1` si la lista está vacía. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

/** Mueve la selección `delta` posiciones con clamp (sin wrap-around).
 *  ↓ = `+1`, ↑ = `-1`. Lista vacía → `-1`. */
export function moveSelection(
  index: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return -1;
  return clampIndex(index + delta, length);
}

/** Selección inicial cuando (re)aparece una lista de resultados —p. ej. al
 *  cambiar el texto de búsqueda—: el primero (`0`), o `-1` si no hay
 *  resultados. */
export function resetSelection(length: number): number {
  return length > 0 ? 0 : -1;
}
