import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type DailyMenuComponent = {
  id: string;
  label: string;
  description: string | null;
  kind: "text" | "product" | "choice";
  product_id: string | null;
  product_name: string | null;
  choice_group_id: string | null;
  choice_group_label: string | null;
};

export type DailyMenuChoiceGroup = {
  choice_group_id: string;
  label: string;
  options: DailyMenuComponent[];
};

export type DailyMenuForMozo = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  components: DailyMenuComponent[];
  choice_groups: DailyMenuChoiceGroup[];
  has_choices: boolean;
};

/**
 * Menús del día disponibles HOY para mostrar al mozo en la pantalla de
 * toma de pedido. `todayDow` es 0..6 (0 = domingo) y debe calcularse en el
 * page para no caer en hydration mismatch ni mezclar TZs.
 *
 * En MVP esta vista es **solo informativa** — el mozo lee al cliente y, si
 * el cliente pide el menú del día, carga los productos individualmente. No
 * mandamos el menú entero como item porque `daily_menu_components` son
 * labels, no productos reales (no tienen station_id ni precio individual).
 * Cuando aparezca un caso real de "el mozo quiere mandarlo en un toque",
 * se mapea cada componente a un producto real (deuda eventual).
 */
export async function getDailyMenusForToday(
  businessId: string,
  todayDow: number,
): Promise<DailyMenuForMozo[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("daily_menus")
    .select(
      "id, name, description, price_cents, image_url, sort_order, daily_menu_components(id, label, description, sort_order, kind, product_id, choice_group_id, choice_group_label, products(id, name, image_url))",
    )
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("is_available", true)
    .contains("available_days", [todayDow])
    .order("sort_order");

  if (error) {
    console.error("getDailyMenusForToday", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((m) => {
    const components: DailyMenuComponent[] = (m.daily_menu_components ?? [])
      .slice()
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((c: any) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        kind: c.kind ?? "text",
        product_id: c.product_id ?? null,
        product_name: c.products?.name ?? null,
        choice_group_id: c.choice_group_id ?? null,
        choice_group_label: c.choice_group_label ?? null,
      }));

    const groupMap = new Map<string, DailyMenuChoiceGroup>();
    for (const c of components) {
      if (c.kind === "choice" && c.choice_group_id) {
        let group = groupMap.get(c.choice_group_id);
        if (!group) {
          group = {
            choice_group_id: c.choice_group_id,
            label: c.choice_group_label ?? "Elegí una opción",
            options: [],
          };
          groupMap.set(c.choice_group_id, group);
        }
        group.options.push(c);
      }
    }

    return {
      id: m.id,
      name: m.name,
      description: m.description,
      price_cents: Number(m.price_cents),
      image_url: m.image_url,
      components,
      choice_groups: [...groupMap.values()],
      has_choices: groupMap.size > 0,
    };
  });
}
