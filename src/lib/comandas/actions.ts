"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { createNotification } from "@/lib/notifications/create";
import { notifyItemCancelled } from "@/lib/notifications/events";
import { canCancelItem, canReimprimirComanda } from "@/lib/permissions/can";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

import { resolveComboUpcharge } from "@/lib/orders/combo-pricing";

import { createComandasForItems } from "./route-items";
import { resolveStation } from "./routing";
import type { ComandaStatus, KitchenItemStatus } from "./types";

type GenericClient = SupabaseClient;

/**
 * Item nuevo a enviar a comandas. Mismo shape que el carrito interno del
 * mozo, sin campos ya calculados (precio, station — se resuelven server).
 */
export type EnviarComandaItem = {
  kind?: "product";
  product_id: string;
  quantity: number;
  notes?: string | null;
  modifier_ids?: string[];
  seat_number?: number | null;
  /** _key estable de la línea del carrito. Idempotencia (spec 42). */
  client_line_key?: string | null;
};

export type EnviarComandaDailyMenuItem = {
  kind: "daily_menu";
  daily_menu_id: string;
  quantity: number;
  notes?: string | null;
  selected_choices?: {
    choice_group_id: string;
    product_id: string;
    modifier_ids?: string[];
  }[];
  /** _key estable de la línea del carrito. Idempotencia (spec 42). */
  client_line_key?: string | null;
};

export type EnviarComandaInput = {
  tableId: string;
  items: (EnviarComandaItem | EnviarComandaDailyMenuItem)[];
  slug: string;
};

export type EnviarComandaResult = {
  order_id: string;
  comanda_ids: string[];
};

const NEXT_STATUS: Record<ComandaStatus, ComandaStatus> = {
  pendiente: "en_preparacion",
  en_preparacion: "entregado",
  entregado: "entregado",
};

const NEXT_ITEM_STATUS: Record<KitchenItemStatus, KitchenItemStatus> = {
  pending: "preparing",
  preparing: "ready",
  ready: "delivered",
  delivered: "delivered",
};

/**
 * Crea (o reusa) la orden activa de una mesa, inserta order_items con
 * routing a sector, y crea una comanda por cada sector con batch
 * autoincremental. Snapshots de modificadores.
 */
export async function enviarComanda(
  input: EnviarComandaInput,
): Promise<ActionResult<EnviarComandaResult>> {
  if (input.items.length === 0) return actionError("Sin items para enviar.");

  const business = await getBusiness(input.slug);
  if (!business) return actionError("Negocio no encontrado.");

  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return actionError("Sin sesión.");

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  // Cross-tenant: la mesa debe pertenecer a un floor_plan de este business.
  const { data: table } = await service
    .from("tables")
    .select("id, operational_status, opened_at, floor_plans!inner(business_id)")
    .eq("id", input.tableId)
    .maybeSingle();
  const tableBusinessId =
    (table as { floor_plans?: { business_id: string } } | null)?.floor_plans
      ?.business_id;
  if (!table || tableBusinessId !== business.id) {
    return actionError("Mesa no encontrada.");
  }

  const productItems = input.items.filter(
    (i): i is EnviarComandaItem => i.kind !== "daily_menu",
  );
  const dailyMenuItems = input.items.filter(
    (i): i is EnviarComandaDailyMenuItem => i.kind === "daily_menu",
  );

  const productIds = [...new Set(productItems.map((i) => i.product_id))];
  const { data: productRows } = await service
    .from("products")
    .select(
      "id, name, price_cents, business_id, is_active, is_available, station_id, track_stock, category:categories(station_id)",
    )
    .in("id", productIds);

  type ProductRow = {
    id: string;
    name: string;
    price_cents: number;
    business_id: string;
    is_active: boolean;
    is_available: boolean;
    station_id: string | null;
    track_stock: boolean;
    category: { station_id: string | null } | null;
  };
  const products = (productRows ?? []) as unknown as ProductRow[];
  if (products.length !== productIds.length) {
    return actionError("Algún producto no existe.");
  }
  const productById = new Map<string, ProductRow>();
  for (const p of products) {
    if (p.business_id !== business.id) return actionError("Producto inválido.");
    if (!p.is_active || !p.is_available) {
      return actionError(`"${p.name}" no está disponible.`);
    }
    productById.set(p.id, p);
  }

  const allModifierIds = [
    ...new Set(productItems.flatMap((i) => i.modifier_ids ?? [])),
  ];
  type ModifierRow = {
    id: string;
    name: string;
    price_delta_cents: number;
    is_available: boolean;
    group_id: string;
  };
  const modifierById = new Map<string, ModifierRow>();
  if (allModifierIds.length > 0) {
    const { data: modifiers } = await service
      .from("modifiers")
      .select("id, name, price_delta_cents, is_available, group_id")
      .in("id", allModifierIds);
    const rows = (modifiers ?? []) as unknown as ModifierRow[];
    if (rows.length !== allModifierIds.length) {
      return actionError("Algún adicional no existe.");
    }
    for (const m of rows) {
      if (!m.is_available) return actionError("Algún adicional no está disponible.");
      modifierById.set(m.id, m);
    }
  }

  // Validación de modifier_groups: si un grupo es required (min_selection > 0)
  // de un producto enviado, los modifier_ids del item deben cubrir el mínimo.
  // Defensa contra clients que se saltan el modal.
  type GroupRow = {
    id: string;
    product_id: string;
    name: string;
    min_selection: number;
    max_selection: number;
  };
  const { data: groups } = await service
    .from("modifier_groups")
    .select("id, product_id, name, min_selection, max_selection")
    .in("product_id", productIds);
  for (const inputItem of productItems) {
    const productGroups = ((groups ?? []) as unknown as GroupRow[]).filter(
      (g) => g.product_id === inputItem.product_id,
    );
    const selected = inputItem.modifier_ids ?? [];
    for (const g of productGroups) {
      const countInGroup = selected.filter(
        (id) => modifierById.get(id)?.group_id === g.id,
      ).length;
      if (countInGroup < g.min_selection) {
        const product = productById.get(inputItem.product_id)!;
        return actionError(
          `"${product.name}": elegí al menos ${g.min_selection} en "${g.name}".`,
        );
      }
      if (countInGroup > g.max_selection) {
        const product = productById.get(inputItem.product_id)!;
        return actionError(
          `"${product.name}": hasta ${g.max_selection} en "${g.name}".`,
        );
      }
    }
  }

  // Resolvemos / creamos la order activa. Una sola por mesa garantizada por
  // el partial unique index `orders_one_open_per_table`.
  const { data: existing } = await service
    .from("orders")
    .select("id, mozo_id")
    .eq("table_id", input.tableId)
    .eq("business_id", business.id)
    .eq("lifecycle_status", "open")
    .maybeSingle();

  let orderId: string;
  if (existing) {
    orderId = (existing as { id: string }).id;
  } else {
    // `mozo_id` es snapshot inmutable: el mozo que abrió la orden (primer
    // envío). NO se actualiza en transferencias de mesa (eso lo refleja
    // `tables.mozo_id`, que sí es mutable). La propina al "mozo que
    // atendió" usa `payments.attributed_mozo_id`, derivado del último
    // que cargó items via `order_items.loaded_by`. Ver DT-002 (resuelto)
    // en wiki/deuda-tecnica.md y wiki/casos-de-uso/CU-09-asignacion-mozo.md.
    const { data: created, error: orderErr } = await service
      .from("orders")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        order_number: 0,
        business_id: business.id,
        customer_name: "Mesa",
        customer_phone: "-",
        delivery_type: "dine_in",
        table_id: input.tableId,
        mozo_id: user.id,
        lifecycle_status: "open",
        subtotal_cents: 0,
        delivery_fee_cents: 0,
        total_cents: 0,
        payment_method: "cash",
      } as any)
      .select("id")
      .single();
    if (orderErr || !created) {
      console.error("enviarComanda · order insert", orderErr);
      return actionError("No pudimos abrir la orden.");
    }
    orderId = (created as { id: string }).id;
  }

  // ── Idempotencia (spec 42) ───────────────────────────────────────────────
  // Cada línea trae un `client_line_key` estable (el `_key` del carrito del
  // mozo). Si ya existe un order_item con ese key en esta orden, la línea ya se
  // envió (doble-tap / reenvío) → la salteamos. Chequeo up-front para el caso
  // secuencial; el índice UNIQUE parcial (order_id, client_line_key) cierra
  // además la carrera concurrente en el propio insert (violación 23505).
  const inputKeys = input.items
    .map((i) => i.client_line_key)
    .filter((k): k is string => !!k);
  const dispatchedKeyToItemId = new Map<string, string>();
  if (inputKeys.length > 0) {
    const { data: existingRows } = await service
      .from("order_items")
      .select("id, client_line_key")
      .eq("order_id", orderId)
      .in("client_line_key", inputKeys);
    for (const row of (existingRows ?? []) as {
      id: string;
      client_line_key: string | null;
    }[]) {
      if (row.client_line_key) dispatchedKeyToItemId.set(row.client_line_key, row.id);
    }
  }

  // Insertamos order_items con station_id resuelto + snapshots de modifiers.
  // Items sin station resoluble (ej: bebidas en negocios sin sector "Barra")
  // se insertan con `station_id=null` y NO generan comanda — el mozo los
  // gestiona directo. Decisión 2026-05-07.
  const itemsByStation = new Map<string, string[]>();

  for (const inputItem of productItems) {
    // Idempotencia (spec 42): línea ya enviada → saltear (no reinsertar).
    if (
      inputItem.client_line_key &&
      dispatchedKeyToItemId.has(inputItem.client_line_key)
    ) {
      continue;
    }

    const product = productById.get(inputItem.product_id)!;
    const stationId = resolveStation(
      { station_id: product.station_id, category: product.category },
      null,
    );

    const modIds = inputItem.modifier_ids ?? [];
    const mods = modIds.map((id) => modifierById.get(id)!);
    const modsTotal = mods.reduce((a, m) => a + Number(m.price_delta_cents), 0);
    const subtotal =
      (Number(product.price_cents) + modsTotal) * inputItem.quantity;

    const seatNum =
      inputItem.seat_number != null && inputItem.seat_number >= 1
        ? inputItem.seat_number
        : null;

    // Items con track_stock (bebidas, vinos) se marcan entregados directo
    // — el mozo los sirve sin pasar por cocina. El trigger de stock
    // (fn_stock_descuento_on_order_item) descuenta igual en el insert.
    const isStockItem = product.track_stock;

    const { data: itemRow, error: itemErr } = await service
      .from("order_items")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        order_id: orderId,
        product_id: product.id,
        product_name: product.name,
        unit_price_cents: product.price_cents,
        quantity: inputItem.quantity,
        notes: inputItem.notes ?? null,
        subtotal_cents: subtotal,
        station_id: isStockItem ? null : stationId,
        loaded_by: user.id,
        kitchen_status: isStockItem ? "delivered" : "pending",
        seat_number: seatNum,
        client_line_key: inputItem.client_line_key ?? null,
      } as any)
      .select("id")
      .single();
    if (itemErr || !itemRow) {
      // 23505 sobre el índice (order_id, client_line_key): carrera concurrente
      // con otro envío de la misma línea → ya está insertada, la salteamos.
      if ((itemErr as { code?: string } | null)?.code === "23505") continue;
      console.error("enviarComanda · item insert", itemErr);
      return actionError("No pudimos guardar los items.");
    }

    if (mods.length > 0) {
      const { error: modErr } = await service
        .from("order_item_modifiers")
        .insert(
          mods.map((m) => ({
            order_item_id: (itemRow as { id: string }).id,
            modifier_id: m.id,
            modifier_name: m.name,
            price_delta_cents: m.price_delta_cents,
          })),
        );
      if (modErr) {
        console.error("enviarComanda · modifier insert", modErr);
        return actionError("No pudimos guardar los adicionales.");
      }
    }

    // Solo agregar a la comanda si no es item de stock (bebidas skip cocina).
    if (stationId && !isStockItem) {
      const bucket = itemsByStation.get(stationId) ?? [];
      bucket.push((itemRow as { id: string }).id);
      itemsByStation.set(stationId, bucket);
    }
  }

  // ── Daily menu items: crear padre + hijos ──
  for (const menuItem of dailyMenuItems) {
    // Idempotencia (spec 42): combo ya enviado → saltear padre + hijos.
    if (
      menuItem.client_line_key &&
      dispatchedKeyToItemId.has(menuItem.client_line_key)
    ) {
      continue;
    }

    const { data: menuRow } = await service
      .from("daily_menus")
      .select(
        "id, name, price_cents, image_url, business_id, is_active, is_available, daily_menu_components(id, label, description, sort_order, kind, product_id, choice_group_id, choice_group_label, extra_price_cents)",
      )
      .eq("id", menuItem.daily_menu_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const menu = menuRow as any;
    if (!menu || menu.business_id !== business.id) {
      return actionError("Menú del día no encontrado.");
    }
    if (!menu.is_active || !menu.is_available) {
      return actionError(`"${menu.name}" no está disponible.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const components = (menu.daily_menu_components ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

    // Adicional por opción (spec 29): se deriva de la DB, nunca del payload.
    const upcharge = resolveComboUpcharge(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components.map((c: any) => ({
        kind: c.kind ?? "text",
        choice_group_id: c.choice_group_id,
        product_id: c.product_id,
        extra_price_cents: Number(c.extra_price_cents ?? 0),
      })),
      (menuItem.selected_choices ?? []).map((sc) => ({
        choice_group_id: sc.choice_group_id,
        product_id: sc.product_id,
      })),
    );
    if (!upcharge.ok) return actionError(upcharge.error);

    const menuPrice = Number(menu.price_cents) + upcharge.deltaCents;
    const menuSubtotal = menuPrice * menuItem.quantity;

    // Desglose de las opciones elegidas para el snapshot (todo de la DB: el
    // payload del mozo no trae labels). `label` de un componente choice es el
    // nombre del producto elegido (lo setea el form).
    const choiceCompByKey = new Map<string, any>(
      components
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any) => c.kind === "choice" && c.choice_group_id && c.product_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => [`${c.choice_group_id}::${c.product_id}`, c]),
    );
    const snapshotChoices = (menuItem.selected_choices ?? []).map((sc) => {
      const comp = choiceCompByKey.get(`${sc.choice_group_id}::${sc.product_id}`);
      return {
        choice_group_label: comp?.choice_group_label ?? "Opción",
        product_name: comp?.label ?? "",
        extra_price_cents: Number(comp?.extra_price_cents ?? 0),
      };
    });

    const snapshot = {
      name: menu.name,
      image_url: menu.image_url,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components: components.map((c: any) => ({
        label: c.label,
        description: c.description,
        kind: c.kind ?? "text",
        product_id: c.product_id,
      })),
      selected_choices: snapshotChoices,
    };

    const { data: parentRow, error: parentErr } = await service
      .from("order_items")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        order_id: orderId,
        product_id: null,
        daily_menu_id: menu.id,
        daily_menu_snapshot: snapshot,
        product_name: menu.name,
        // Adicional en el PADRE; los hijos van en $0 más abajo.
        unit_price_cents: menuPrice,
        quantity: menuItem.quantity,
        notes: menuItem.notes ?? null,
        subtotal_cents: menuSubtotal,
        loaded_by: user.id,
        kitchen_status: "pending",
        client_line_key: menuItem.client_line_key ?? null,
      } as any)
      .select("id")
      .single();
    if (parentErr || !parentRow) {
      // 23505 (order_id, client_line_key): combo ya enviado → saltear.
      if ((parentErr as { code?: string } | null)?.code === "23505") continue;
      console.error("enviarComanda · daily_menu parent insert", parentErr);
      return actionError("No pudimos guardar el menú del día.");
    }
    const parentId = (parentRow as { id: string }).id;

    const childProductIds: string[] = [];
    for (const c of components) {
      if (c.kind === "product" && c.product_id) childProductIds.push(c.product_id);
    }
    for (const sc of menuItem.selected_choices ?? []) {
      childProductIds.push(sc.product_id);
    }

    if (childProductIds.length > 0) {
      const missingIds = [...new Set(childProductIds)].filter(
        (id) => !productById.has(id),
      );
      if (missingIds.length > 0) {
        const { data: childProds } = await service
          .from("products")
          .select(
            "id, name, price_cents, business_id, is_active, is_available, station_id, category:categories(station_id)",
          )
          .in("id", missingIds);
        for (const p of (childProds ?? []) as unknown as ProductRow[]) {
          productById.set(p.id, p);
        }
      }

      // Un hijo por componente (spec 36 · R-E4): NO deduplicar por product_id.
      // El flujo público (persist-order) inserta un order_item hijo por cada
      // componente; si acá deduplicábamos con Set, un combo con el mismo
      // producto repetido descontaba stock/receta 1 vez en el mozo y N en el
      // público. `missingIds` sí puede deduplicar (es solo para fetchear).
      for (const pid of childProductIds) {
        const childProduct = productById.get(pid);
        if (!childProduct) continue;
        const childStation = resolveStation(
          { station_id: childProduct.station_id, category: childProduct.category },
          null,
        );

        const { data: childRow } = await service
          .from("order_items")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            order_id: orderId,
            product_id: pid,
            product_name: childProduct.name,
            unit_price_cents: 0,
            quantity: menuItem.quantity,
            subtotal_cents: 0,
            parent_order_item_id: parentId,
            is_combo_component: true,
            station_id: childStation,
            loaded_by: user.id,
            kitchen_status: "pending",
          } as any)
          .select("id")
          .single();

        if (childRow && childStation) {
          const bucket = itemsByStation.get(childStation) ?? [];
          bucket.push((childRow as { id: string }).id);
          itemsByStation.set(childStation, bucket);
        }
      }
    }
  }

  // Una comanda por sector con batch autoincremental dentro de (order, station).
  const routeResult = await createComandasForItems(service, orderId, itemsByStation);
  if (!routeResult.ok) return actionError(routeResult.error);
  let comandaIds = routeResult.comanda_ids;

  // Idempotencia (spec 42): si hubo líneas ya despachadas (retry), devolvemos
  // también las comandas a las que pertenecen → respuesta estable en el reenvío.
  if (dispatchedKeyToItemId.size > 0) {
    const dupItemIds = [...dispatchedKeyToItemId.values()];
    const { data: dupComandaItems } = await service
      .from("comanda_items")
      .select("comanda_id")
      .in("order_item_id", dupItemIds);
    const dupComandaIds = (
      (dupComandaItems ?? []) as { comanda_id: string }[]
    ).map((r) => r.comanda_id);
    comandaIds = [...new Set([...comandaIds, ...dupComandaIds])];
  }

  // Recalculamos totales de la orden (suma de todos los items, no solo
  // los nuevos — la orden puede tener items previos de tandas anteriores).
  const { data: allItems } = await service
    .from("order_items")
    .select("subtotal_cents, cancelled_at")
    .eq("order_id", orderId);
  const newSubtotal = ((allItems ?? []) as { subtotal_cents: number; cancelled_at: string | null }[])
    .filter((it) => !it.cancelled_at)
    .reduce((a, it) => a + Number(it.subtotal_cents), 0);

  await service
    .from("orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      subtotal_cents: newSubtotal,
      total_cents: newSubtotal,
    } as any)
    .eq("id", orderId);

  // Mesa queda `ocupada` al enviar comanda. Si estaba libre, fijamos
  // opened_at. Si estaba pidio_cuenta y vuelven a pedir, pasa a ocupada
  // y limpiamos bill_requested_at (cliente se arrepintió, quiere más).
  const tableStatus = (table as { operational_status: string }).operational_status;
  const tableOpenedAt = (table as { opened_at: string | null }).opened_at;
  const tablePatch: Record<string, unknown> = {
    operational_status: "ocupada",
    current_order_id: orderId,
  };
  if (tableStatus === "libre" || !tableOpenedAt) {
    tablePatch.opened_at = tableOpenedAt ?? new Date().toISOString();
  }
  await service.from("tables").update(tablePatch).eq("id", input.tableId);

  // Si la mesa venía de pidio_cuenta (cliente pidió más), limpiamos el flag.
  if (tableStatus === "pidio_cuenta") {
    await service
      .from("orders")
      .update({ bill_requested_at: null })
      .eq("id", orderId);
  }

  revalidatePath(`/${input.slug}/mozo`);
  revalidatePath(`/${input.slug}/cocina`);

  return actionOk({ order_id: orderId, comanda_ids: comandaIds });
}

/**
 * Marca una comanda como `entregado` cuando el mozo levanta el plato.
 * Cualquier rol que opera salón puede hacerlo (mozo+).
 *
 * Acepta como origen `pendiente` o `en_preparacion` (spec-05: un solo
 * gesto operativo). Si ya está `entregado`, no-op.
 */
export async function marcarComandaEntregada(
  comandaId: string,
  slug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: row } = await service
    .from("comandas")
    .select("id, status, orders!inner(business_id)")
    .eq("id", comandaId)
    .maybeSingle();
  const ownerBusinessId = (row as { orders?: { business_id: string } } | null)
    ?.orders?.business_id;
  if (!row || ownerBusinessId !== business.id) {
    return actionError("Comanda no encontrada.");
  }
  const current = (row as { status: ComandaStatus }).status;
  if (current === "entregado") return actionOk(undefined);
  if (current !== "en_preparacion" && current !== "pendiente") {
    return actionError("Estado inesperado de comanda.");
  }

  const nowIso = new Date().toISOString();
  const { error } = await service
    .from("comandas")
    .update({ status: "entregado", delivered_at: nowIso })
    .eq("id", comandaId);
  if (error) {
    console.error("marcarComandaEntregada", error);
    return actionError("No pudimos marcar la comanda.");
  }

  // Espejamos en kitchen_status de los items vinculados (el kanban de Comandas
  // en /admin/operacion los lee; la pantalla /cocina fue eliminada, d3).
  const { data: links } = await service
    .from("comanda_items")
    .select("order_item_id")
    .eq("comanda_id", comandaId);
  const itemIds = ((links ?? []) as { order_item_id: string }[]).map(
    (l) => l.order_item_id,
  );
  if (itemIds.length > 0) {
    await service
      .from("order_items")
      .update({ kitchen_status: "delivered" })
      .in("id", itemIds);
  }

  // Notify the mozo that the comanda is ready to serve.
  try {
    const { data: comandaRow } = await service
      .from("comandas")
      .select("station_id, order_id")
      .eq("id", comandaId)
      .maybeSingle();
    const cRow = comandaRow as { station_id: string | null; order_id: string } | null;
    if (cRow) {
      const { data: orderRow } = await service
        .from("orders")
        .select("table_id")
        .eq("id", cRow.order_id)
        .maybeSingle();
      const tableId = (orderRow as { table_id: string | null } | null)?.table_id;
      if (tableId) {
        const { data: tableRow } = await service
          .from("tables")
          .select("mozo_id, label")
          .eq("id", tableId)
          .maybeSingle();
        const tbl = tableRow as { mozo_id: string | null; label: string } | null;

        let stationName = "Cocina";
        if (cRow.station_id) {
          const { data: stationRow } = await service
            .from("stations")
            .select("name")
            .eq("id", cRow.station_id)
            .maybeSingle();
          if (stationRow) stationName = (stationRow as { name: string }).name;
        }

        if (tbl?.mozo_id) {
          await createNotification({
            businessId: business.id,
            userId: tbl.mozo_id,
            type: "comanda.entregada",
            payload: {
              tableLabel: tbl.label,
              stationName,
              itemCount: itemIds.length,
            },
          });
        }
      }
    }
  } catch (e) {
    console.error("marcarComandaEntregada notification", e);
  }

  revalidatePath(`/${slug}/mozo`);
  return actionOk(undefined);
}

/**
 * Avanza la comanda al siguiente estado (pendiente → en_preparacion →
 * entregado). Setea timestamps. Cross-tenant via order.business_id.
 *
 * Tras la decisión 2026-05-07 cocina recibe ticket impreso (no pantalla),
 * el estado `listo` no existe — pasamos directo a `entregado` cuando el
 * mozo levanta el plato.
 */
export async function advanceComandaStatus(
  comandaId: string,
  slug: string,
): Promise<ActionResult<{ status: ComandaStatus }>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: row } = await service
    .from("comandas")
    .select("id, status, orders!inner(business_id)")
    .eq("id", comandaId)
    .maybeSingle();
  const ownerBusinessId =
    (row as { orders?: { business_id: string } } | null)?.orders?.business_id;
  if (!row || ownerBusinessId !== business.id) {
    return actionError("Comanda no encontrada.");
  }
  const current = (row as { status: ComandaStatus }).status;
  const next = NEXT_STATUS[current];
  if (next === current) return actionOk({ status: current });

  const patch: Record<string, unknown> = { status: next };
  if (next === "entregado") patch.delivered_at = new Date().toISOString();

  const { error } = await service
    .from("comandas")
    .update(patch)
    .eq("id", comandaId);
  if (error) {
    console.error("advanceComandaStatus", error);
    return actionError("No pudimos avanzar la comanda.");
  }

  // Espejamos el avance en kitchen_status de los items. `kitchen_status`
  // mantiene el set de 4 valores legacy (el kanban de Comandas los usa; la
  // pantalla /cocina fue eliminada, d3) —
  // mapeamos los 3 estados de comanda a los 3 que sí movemos.
  const itemKitchen: KitchenItemStatus =
    next === "pendiente"
      ? "pending"
      : next === "en_preparacion"
        ? "preparing"
        : "delivered";

  const { data: links } = await service
    .from("comanda_items")
    .select("order_item_id")
    .eq("comanda_id", comandaId);
  const itemIds = (
    (links ?? []) as { order_item_id: string }[]
  ).map((l) => l.order_item_id);
  if (itemIds.length > 0) {
    await service
      .from("order_items")
      .update({ kitchen_status: itemKitchen })
      .in("id", itemIds);
  }

  revalidatePath(`/${slug}/cocina`);
  revalidatePath(`/${slug}/mozo`);
  return actionOk({ status: next });
}

/**
 * Avanza el kitchen_status de un solo item (granularidad por item dentro de
 * la comanda — D-CU00-5). Si todos los items de la comanda quedan en
 * 'delivered', la comanda se promueve a 'entregado'.
 */
export async function advanceItemKitchenStatus(
  orderItemId: string,
  slug: string,
): Promise<ActionResult<{ kitchen_status: KitchenItemStatus }>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: item } = await service
    .from("order_items")
    .select("id, kitchen_status, orders!inner(business_id)")
    .eq("id", orderItemId)
    .maybeSingle();
  const itemBusinessId =
    (item as { orders?: { business_id: string } } | null)?.orders?.business_id;
  if (!item || itemBusinessId !== business.id) {
    return actionError("Item no encontrado.");
  }
  const current = (item as { kitchen_status: KitchenItemStatus }).kitchen_status;
  const next = NEXT_ITEM_STATUS[current];
  if (next === current) return actionOk({ kitchen_status: current });

  const { error } = await service
    .from("order_items")
    .update({ kitchen_status: next })
    .eq("id", orderItemId);
  if (error) {
    console.error("advanceItemKitchenStatus", error);
    return actionError("No pudimos avanzar el item.");
  }

  // Si el item ahora es 'delivered', chequeamos si todos los items de cada
  // comanda que lo contiene también lo están. Si sí, promovemos la comanda.
  if (next === "delivered") {
    const { data: links } = await service
      .from("comanda_items")
      .select("comanda_id")
      .eq("order_item_id", orderItemId);
    const comandaIds = [
      ...new Set(((links ?? []) as { comanda_id: string }[]).map((l) => l.comanda_id)),
    ];
    for (const cid of comandaIds) {
      const { data: siblings } = await service
        .from("comanda_items")
        .select("order_items!inner(kitchen_status, cancelled_at)")
        .eq("comanda_id", cid);
      type Sibling = {
        order_items: { kitchen_status: KitchenItemStatus; cancelled_at: string | null };
      };
      const live = ((siblings ?? []) as unknown as Sibling[]).filter(
        (s) => !s.order_items.cancelled_at,
      );
      const allDelivered =
        live.length > 0 && live.every((s) => s.order_items.kitchen_status === "delivered");
      if (allDelivered) {
        await service
          .from("comandas")
          .update({
            status: "entregado",
            delivered_at: new Date().toISOString(),
          })
          .eq("id", cid);
      }
    }
  }

  revalidatePath(`/${slug}/cocina`);
  revalidatePath(`/${slug}/mozo`);
  // La tab Comandas del back-office (operación) también lee estos estados —
  // sin esto, el avance por item no se propaga al kanban. Igual que el fix
  // ya aplicado a las acciones de mesa.
  revalidatePath(`/${slug}/admin/operacion`);
  return actionOk({ kitchen_status: next });
}

/**
 * Cancela un item (flow de "86" / rotura). Marca cancelled_at + reason; la
 * comanda no se mueve por sí sola, pero la cocina ve el flag.
 */
export async function cancelarItem(
  orderItemId: string,
  motivo: string,
  slug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");
  const trimmed = motivo.trim();
  if (!trimmed) return actionError("Indicá un motivo.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canCancelItem(ctxResult.data.role)) {
    return actionError("Solo encargado o admin pueden cancelar un item.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: item } = await service
    .from("order_items")
    .select("id, cancelled_at, orders!inner(id, business_id)")
    .eq("id", orderItemId)
    .maybeSingle();
  const itemBusinessId =
    (item as { orders?: { business_id: string } } | null)?.orders?.business_id;
  if (!item || itemBusinessId !== business.id) {
    return actionError("Item no encontrado.");
  }
  if ((item as { cancelled_at: string | null }).cancelled_at) {
    return actionError("El item ya estaba cancelado.");
  }

  const { error } = await service
    .from("order_items")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_reason: trimmed,
      cancelled_by: ctxResult.data.userId, // spec 34 — responsable de la anulación
    })
    .eq("id", orderItemId);
  if (error) {
    console.error("cancelarItem", error);
    return actionError("No pudimos cancelar el item.");
  }

  // Recalcular subtotal de la order excluyendo cancelados.
  const orderId = (item as unknown as { orders: { id: string } }).orders.id;
  const { data: items } = await service
    .from("order_items")
    .select("subtotal_cents, cancelled_at")
    .eq("order_id", orderId);
  const newSubtotal = ((items ?? []) as { subtotal_cents: number; cancelled_at: string | null }[])
    .filter((it) => !it.cancelled_at)
    .reduce((a, it) => a + Number(it.subtotal_cents), 0);

  // Leer tip/discount actuales para no pisar el total si ya se aplicaron.
  const { data: orderRow } = await service
    .from("orders")
    .select("tip_cents, discount_cents, delivery_fee_cents")
    .eq("id", orderId)
    .single();
  const tip = Number((orderRow as { tip_cents: number } | null)?.tip_cents ?? 0);
  const discount = Number((orderRow as { discount_cents: number } | null)?.discount_cents ?? 0);
  const fee = Number((orderRow as { delivery_fee_cents: number } | null)?.delivery_fee_cents ?? 0);
  const newTotal = Math.max(0, newSubtotal + tip + fee - discount);

  await service
    .from("orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ subtotal_cents: newSubtotal, total_cents: newTotal } as any)
    .eq("id", orderId);

  // spec 27 — avisar al mozo de la mesa que se anuló un ítem (el actor
  // encargado/admin no se autoavisa; resuelve mesa + destinatario en el helper).
  await notifyItemCancelled({
    businessId: business.id,
    orderId,
    reason: trimmed,
    actorUserId: ctxResult.data.userId,
    actorRole: ctxResult.data.role,
  });

  revalidatePath(`/${slug}/cocina`);
  revalidatePath(`/${slug}/mozo`);
  // La tab Comandas del back-office (operación) muestra los items cancelados
  // en vivo — sin esto, el "86" no se refleja en el kanban hasta un refresh
  // manual. Igual que el fix ya aplicado a las acciones de mesa.
  revalidatePath(`/${slug}/admin/operacion`);
  return actionOk(undefined);
}

/**
 * Pide reimprimir una comanda desde operación (spec 35). Setea
 * `reprint_requested_at = now()` y limpia `print_failed_at`:
 *
 * - El `GET /api/print-agent` incluye las comandas con `reprint_requested_at`
 *   seteado aunque ya hayan avanzado → el agente la (re)imprime sin cambios.
 * - Limpiar `print_failed_at` resetea el dedup del aviso del spec 33: si el
 *   reintento vuelve a fallar, puede volver a notificar.
 *
 * NO toca la máquina de estados de la comanda (reimpresión = flag lateral).
 * Sirve tanto para "Reimprimir" (comanda avanzada) como para "Reintentar"
 * (comanda fallada) — ambos terminan en el mismo lugar. Gate encargado/admin
 * + scope por `business_id`.
 */
export async function solicitarReimpresion(
  slug: string,
  comandaId: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canReimprimirComanda(ctxResult.data.role)) {
    return actionError("Solo encargado o admin pueden reimprimir una comanda.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: row } = await service
    .from("comandas")
    .select("id, orders!inner(business_id)")
    .eq("id", comandaId)
    .maybeSingle();
  const ownerBusinessId = (row as { orders?: { business_id: string } } | null)
    ?.orders?.business_id;
  if (!row || ownerBusinessId !== business.id) {
    return actionError("Comanda no encontrada.");
  }

  const { error } = await service
    .from("comandas")
    .update({
      reprint_requested_at: new Date().toISOString(),
      print_failed_at: null,
    })
    .eq("id", comandaId);
  if (error) {
    console.error("solicitarReimpresion", error);
    return actionError("No pudimos pedir la reimpresión.");
  }

  revalidatePath(`/${slug}/admin/operacion`);
  return actionOk(undefined);
}
