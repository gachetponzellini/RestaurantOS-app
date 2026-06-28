/**
 * Cálculo del adicional de un combo de menú del día (spec 29).
 *
 * Puro y testeable. La **fuente de verdad** del precio es `components`
 * (cargados de la DB), nunca el payload del cliente: éste sólo informa QUÉ
 * eligió (`choice_group_id` + `product_id`), jamás CUÁNTO cuesta.
 *
 * El delta resultante se suma al `order_item` **padre** del combo; los hijos
 * quedan en $0 (invariante de `is_combo_component`). Ver
 * `wiki/specs/29-menu-del-dia-opciones-con-adicional/design.md`.
 */

export type ComboChoiceComponent = {
  kind: string;
  choice_group_id: string | null;
  product_id: string | null;
  extra_price_cents: number;
};

export type SelectedChoiceRef = {
  choice_group_id: string;
  product_id: string;
};

export type ResolvedChoice = {
  choice_group_id: string;
  product_id: string;
  extra_price_cents: number;
};

export type ComboUpchargeResult =
  | { ok: true; deltaCents: number; choices: ResolvedChoice[] }
  | { ok: false; error: string };

/**
 * Matchea cada opción elegida contra los componentes `choice` del menú y
 * suma sus `extra_price_cents`. Si una opción no pertenece a ese grupo del
 * menú, rechaza (la orden no debe persistirse).
 */
export function resolveComboUpcharge(
  components: ComboChoiceComponent[],
  selectedChoices: SelectedChoiceRef[],
): ComboUpchargeResult {
  let deltaCents = 0;
  const choices: ResolvedChoice[] = [];
  for (const sc of selectedChoices) {
    const match = components.find(
      (c) =>
        c.kind === "choice" &&
        c.choice_group_id === sc.choice_group_id &&
        c.product_id === sc.product_id,
    );
    if (!match) {
      return {
        ok: false,
        error: "Una de las opciones elegidas no es válida para este menú.",
      };
    }
    // Defensa: el adicional nunca resta (la opción base va en $0).
    const extra = Math.max(0, Number(match.extra_price_cents) || 0);
    deltaCents += extra;
    choices.push({
      choice_group_id: sc.choice_group_id,
      product_id: sc.product_id,
      extra_price_cents: extra,
    });
  }
  return { ok: true, deltaCents, choices };
}
