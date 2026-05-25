import "server-only";

import { cache } from "react";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type MenuModifier = {
  id: string;
  name: string;
  price_delta_cents: number;
  is_available: boolean;
  sort_order: number;
};

export type MenuModifierGroup = {
  id: string;
  name: string;
  min_selection: number;
  max_selection: number;
  is_required: boolean;
  sort_order: number;
  modifiers: MenuModifier[];
};

export type MenuProduct = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  modifier_groups: MenuModifierGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  products: MenuProduct[];
};

export type MenuDailyMenuComponent = {
  id: string;
  label: string;
  description: string | null;
  kind: "text" | "product" | "choice";
  product_id: string | null;
  product_name: string | null;
  product_image_url: string | null;
  choice_group_id: string | null;
  choice_group_label: string | null;
};

export type MenuDailyMenuChoiceGroup = {
  choice_group_id: string;
  label: string;
  options: MenuDailyMenuComponent[];
};

export type MenuDailyMenu = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  components: MenuDailyMenuComponent[];
  choice_groups: MenuDailyMenuChoiceGroup[];
  has_choices: boolean;
};

export type BusinessHour = {
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

export type MenuData = {
  categories: MenuCategory[];
  hours: BusinessHour[];
  todaysMenus: MenuDailyMenu[];
};

/**
 * Catálogo público. `todayDow` es el día de la semana actual (0..6) en el
 * TZ del negocio y se usa para filtrar los menús del día. Se pasa desde el
 * server component para evitar hydration mismatch — nunca calculamos `Date`
 * en el cliente acá.
 */
export const getMenu = cache(
  async (businessId: string, todayDow: number): Promise<MenuData> => {
    const supabase = createSupabaseServiceClient();

    const [
      { data: categories },
      { data: products },
      { data: hours },
      { data: dailyMenus },
    ] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, slug, sort_order")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("products")
        .select(
          "id, category_id, name, slug, description, price_cents, image_url, is_available, sort_order, modifier_groups(id, name, min_selection, max_selection, is_required, sort_order, modifiers(id, name, price_delta_cents, is_available, sort_order))",
        )
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("business_hours")
        .select("day_of_week, opens_at, closes_at")
        .eq("business_id", businessId),
      supabase
        .from("daily_menus")
        .select(
          "id, name, description, price_cents, image_url, available_days, daily_menu_components(id, label, description, sort_order, kind, product_id, choice_group_id, choice_group_label, products(id, name, image_url))",
        )
        .eq("business_id", businessId)
        .eq("is_active", true)
        .eq("is_available", true)
        .contains("available_days", [todayDow])
        .order("sort_order"),
    ]);

  const productsList: MenuProduct[] = (products ?? []).map((p) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price_cents: Number(p.price_cents),
    image_url: p.image_url,
    is_available: p.is_available,
    sort_order: p.sort_order,
    modifier_groups: (p.modifier_groups ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({
        id: g.id,
        name: g.name,
        min_selection: g.min_selection,
        max_selection: g.max_selection,
        is_required: g.is_required,
        sort_order: g.sort_order,
        modifiers: (g.modifiers ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m) => ({
            id: m.id,
            name: m.name,
            price_delta_cents: Number(m.price_delta_cents),
            is_available: m.is_available,
            sort_order: m.sort_order,
          })),
      })),
  }));

  const cats: MenuCategory[] = (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sort_order: c.sort_order,
    products: productsList.filter((p) => p.category_id === c.id),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todaysMenus: MenuDailyMenu[] = (dailyMenus ?? []).map((m: any) => {
    const components: MenuDailyMenuComponent[] = (m.daily_menu_components ?? [])
      .slice()
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((c: any) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        kind: c.kind ?? "text",
        product_id: c.product_id ?? null,
        product_name: c.products?.name ?? null,
        product_image_url: c.products?.image_url ?? null,
        choice_group_id: c.choice_group_id ?? null,
        choice_group_label: c.choice_group_label ?? null,
      }));

    const groupMap = new Map<string, MenuDailyMenuChoiceGroup>();
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

  return {
    categories: cats,
    hours: (hours ?? []) as BusinessHour[],
    todaysMenus,
  };
});
