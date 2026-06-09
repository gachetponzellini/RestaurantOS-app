/**
 * Decide si un item enviado debe generar comanda, aplicando la excepción de
 * la **caja de bar** (spec 08).
 *
 * Regla de negocio (Reunión §6 · §7.13): la barra vende directo y **no manda
 * a comanda**, salvo los sectores que expiden (sanguchería/tostados/tocaditos,
 * marcados con `stations.routes_to_comanda = true`). En una mesa normal el
 * ruteo no cambia: todo item con sector resoluble genera su comanda como hoy.
 *
 * Función pura — sin DB. Se aplica como filtro adicional en `enviarComanda`,
 * DESPUÉS de `resolveStation` y del skip de items de stock. No toca
 * `routing.ts` ni `route-items.ts`.
 */
export function itemGeneraComanda({
  tableIsBar,
  stationExpide,
}: {
  /** La orden pertenece a una mesa de barra (`tables.is_bar`). */
  tableIsBar: boolean;
  /** El sector resuelto expide a comanda (`stations.routes_to_comanda`). */
  stationExpide: boolean;
}): boolean {
  // Mesa normal: comportamiento de salón intacto — siempre genera comanda.
  if (!tableIsBar) return true;
  // Mesa de bar: solo los sectores que expiden imprimen comanda.
  return stationExpide;
}
