"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import {
  canTransition,
  nextOpenedAt,
  type OperationalStatus,
} from "@/lib/mozo/state-machine";
import {
  canAssignMozo,
  canTransferTable,
  canTransitionMesa,
} from "@/lib/permissions/can";
import { createNotification } from "@/lib/notifications/create";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

type GenericClient = SupabaseClient;

// ── Helpers internos ────────────────────────────────────────────

type LoadedTable = {
  id: string;
  operational_status: OperationalStatus;
  opened_at: string | null;
  mozo_id: string | null;
  label: string;
};

async function loadTableForBusiness(
  service: GenericClient,
  tableId: string,
  businessId: string,
): Promise<LoadedTable | null> {
  // Cross-tenant defense: tables no tiene business_id directo, va via floor_plans.
  const { data } = await service
    .from("tables")
    .select(
      "id, operational_status, opened_at, mozo_id, label, floor_plans!inner(business_id)",
    )
    .eq("id", tableId)
    .maybeSingle();
  if (!data) return null;
  const fpRaw = (data as unknown as { floor_plans: unknown }).floor_plans;
  const fp = Array.isArray(fpRaw)
    ? (fpRaw[0] as { business_id: string } | undefined)
    : (fpRaw as { business_id: string } | null);
  if (!fp || fp.business_id !== businessId) return null;
  return {
    id: (data as { id: string }).id,
    operational_status: (data as { operational_status: OperationalStatus })
      .operational_status,
    opened_at: (data as { opened_at: string | null }).opened_at,
    mozo_id: (data as { mozo_id: string | null }).mozo_id,
    label: (data as { label: string }).label,
  };
}

/**
 * Chequea si una mesa tiene una order open con al menos un item activo.
 * Usado para gatear transiciones a `pidio_cuenta` (no se puede pedir cuenta
 * sin items que cobrar).
 */
async function tableHasActiveOrderWithItems(
  service: GenericClient,
  tableId: string,
  businessId: string,
): Promise<boolean> {
  const { data: order } = await service
    .from("orders")
    .select("id")
    .eq("table_id", tableId)
    .eq("business_id", businessId)
    .eq("lifecycle_status", "open")
    .maybeSingle();
  if (!order) return false;
  const orderId = (order as { id: string }).id;
  const { count } = await service
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .is("cancelled_at", null);
  return (count ?? 0) > 0;
}

async function insertAudit(
  service: GenericClient,
  params: {
    tableId: string;
    businessId: string;
    kind: "status" | "assignment" | "transfer";
    fromValue: string | null;
    toValue: string | null;
    byUserId: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const { error } = await service.from("tables_audit_log").insert({
    table_id: params.tableId,
    business_id: params.businessId,
    kind: params.kind,
    from_value: params.fromValue,
    to_value: params.toValue,
    by_user_id: params.byUserId,
    reason: params.reason ?? null,
  });
  if (error) {
    // El audit no debería bloquear la mutación primaria, pero loggear es importante.
    console.error("tables_audit_log insert", error);
  }
}

// ── Estado operacional de la mesa (CU-07) ───────────────────────

export async function updateTableOperationalStatus(
  tableId: string,
  status: OperationalStatus,
  businessSlug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const table = await loadTableForBusiness(service, tableId, business.id);
  if (!table) return actionError("Mesa no encontrada.");

  const from = table.operational_status;
  if (!canTransition(from, status)) {
    return actionError("Transición no permitida.");
  }
  if (!canTransitionMesa(ctx.role, from, status)) {
    return actionError("No tenés permisos para esta acción.");
  }

  if (from === status) {
    // No-op: aceptado por la state machine, pero no escribimos ni audit ni patch.
    return actionOk(undefined);
  }

  // Pidió cuenta requiere order open con items: sin items no hay nada
  // que cobrar. Defensa también disparada desde transiciones genéricas
  // (drawer admin con dropdown de estado).
  if (status === "pidio_cuenta") {
    const hasOrder = await tableHasActiveOrderWithItems(
      service,
      tableId,
      business.id,
    );
    if (!hasOrder) {
      return actionError("La mesa no tiene una orden activa para cobrar.");
    }
  }

  const patch: Record<string, unknown> = { operational_status: status };
  patch.opened_at = nextOpenedAt(from, status, table.opened_at);
  if (status === "libre") {
    patch.current_order_id = null;
  }

  const { error } = await service
    .from("tables")
    .update(patch)
    .eq("id", tableId);
  if (error) {
    console.error("updateTableOperationalStatus", error);
    return actionError("No pudimos actualizar el estado de la mesa.");
  }

  await insertAudit(service, {
    tableId,
    businessId: business.id,
    kind: "status",
    fromValue: from,
    toValue: status,
    byUserId: ctx.userId,
  });

  revalidatePath(`/${businessSlug}/mozo`);
  return actionOk(undefined);
}

/**
 * Pedir cuenta: setea `orders.bill_requested_at = now()` (timestamp persistente,
 * fuente de verdad) y transiciona la mesa a `pidio_cuenta` para el color en el
 * plano. Falla si la mesa no tiene order open o no está en estado `ocupada`.
 */
export async function pedirCuenta(
  tableId: string,
  businessSlug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const table = await loadTableForBusiness(service, tableId, business.id);
  if (!table) return actionError("Mesa no encontrada.");

  const from = table.operational_status;
  if (!canTransition(from, "pidio_cuenta")) {
    return actionError("La mesa no puede pedir cuenta desde este estado.");
  }
  if (!canTransitionMesa(ctx.role, from, "pidio_cuenta")) {
    return actionError("No tenés permisos para esta acción.");
  }

  // Validación dura: tiene que haber order open con items activos. Sin esto
  // no hay nada que cobrar — y la mesa quedaría en pidio_cuenta huérfana.
  const hasOrder = await tableHasActiveOrderWithItems(
    service,
    tableId,
    business.id,
  );
  if (!hasOrder) {
    return actionError("La mesa no tiene una orden activa para cobrar.");
  }

  // Setear bill_requested_at en la order activa (verdad inmutable del evento).
  const { error: orderErr } = await service
    .from("orders")
    .update({ bill_requested_at: new Date().toISOString() })
    .eq("table_id", tableId)
    .eq("business_id", business.id)
    .eq("lifecycle_status", "open")
    .is("bill_requested_at", null);
  if (orderErr) {
    console.error("pedirCuenta order", orderErr);
    return actionError("No pudimos registrar el pedido de cuenta.");
  }

  if (from !== "pidio_cuenta") {
    const { error: tableErr } = await service
      .from("tables")
      .update({ operational_status: "pidio_cuenta" })
      .eq("id", tableId);
    if (tableErr) {
      console.error("pedirCuenta table", tableErr);
      return actionError("No pudimos cambiar el estado de la mesa.");
    }
    await insertAudit(service, {
      tableId,
      businessId: business.id,
      kind: "status",
      fromValue: from,
      toValue: "pidio_cuenta",
      byUserId: ctx.userId,
    });
  }

  revalidatePath(`/${businessSlug}/mozo`);
  return actionOk(undefined);
}

/**
 * Volver a pedir: cliente pidió cuenta pero se arrepintió y quiere postre.
 * Limpia `orders.bill_requested_at` y vuelve la mesa a `ocupada`.
 */
export async function volverAPedir(
  tableId: string,
  businessSlug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const table = await loadTableForBusiness(service, tableId, business.id);
  if (!table) return actionError("Mesa no encontrada.");

  const from = table.operational_status;
  if (!canTransition(from, "ocupada")) {
    return actionError("La mesa no puede volver a pedir desde este estado.");
  }
  if (!canTransitionMesa(ctx.role, from, "ocupada")) {
    return actionError("No tenés permisos para esta acción.");
  }

  await service
    .from("orders")
    .update({ bill_requested_at: null })
    .eq("table_id", tableId)
    .eq("business_id", business.id)
    .eq("lifecycle_status", "open");

  if (from !== "ocupada") {
    const { error: tableErr } = await service
      .from("tables")
      .update({ operational_status: "ocupada" })
      .eq("id", tableId);
    if (tableErr) {
      console.error("volverAPedir table", tableErr);
      return actionError("No pudimos cambiar el estado de la mesa.");
    }
    await insertAudit(service, {
      tableId,
      businessId: business.id,
      kind: "status",
      fromValue: from,
      toValue: "ocupada",
      byUserId: ctx.userId,
    });
  }

  revalidatePath(`/${businessSlug}/mozo`);
  return actionOk(undefined);
}

export async function liberarMesa(
  tableId: string,
  businessSlug: string,
): Promise<ActionResult<void>> {
  return updateTableOperationalStatus(tableId, "libre", businessSlug);
}

/**
 * Anular mesa: pasa a `libre` y marca todas las orders abiertas asociadas
 * como `cancelled` con motivo. Solo encargado/admin.
 */
export async function anularMesa(
  tableId: string,
  motivo: string,
  businessSlug: string,
): Promise<ActionResult<void>> {
  const reason = motivo.trim();
  if (!reason) return actionError("El motivo de anulación es obligatorio.");

  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const table = await loadTableForBusiness(service, tableId, business.id);
  if (!table) return actionError("Mesa no encontrada.");

  const from = table.operational_status;
  if (!canTransition(from, "libre")) {
    return actionError("La mesa no está en un estado anulable.");
  }
  if (!canTransitionMesa(ctx.role, from, "libre")) {
    return actionError("Solo encargado o admin pueden anular una mesa.");
  }

  // Cancelar orders abiertas de esta mesa.
  const nowIso = new Date().toISOString();
  const { error: ordersErr } = await service
    .from("orders")
    .update({
      lifecycle_status: "cancelled",
      cancelled_at: nowIso,
      cancelled_reason: reason,
    })
    .eq("table_id", tableId)
    .eq("business_id", business.id)
    .eq("lifecycle_status", "open");
  if (ordersErr) {
    console.error("anularMesa orders", ordersErr);
    return actionError("No pudimos cancelar las órdenes abiertas.");
  }

  // mozo_id se preserva: la asignación es fija hasta que el encargado la
  // cambie manualmente. Anular la mesa no la saca del mozo asignado.
  const { error: tableErr } = await service
    .from("tables")
    .update({
      operational_status: "libre",
      opened_at: null,
      current_order_id: null,
    })
    .eq("id", tableId);
  if (tableErr) {
    console.error("anularMesa table", tableErr);
    return actionError("No pudimos cambiar el estado de la mesa.");
  }

  await insertAudit(service, {
    tableId,
    businessId: business.id,
    kind: "status",
    fromValue: from,
    toValue: "libre",
    byUserId: ctx.userId,
    reason,
  });

  // Notify the assigned mozo (if any) that their table was cancelled.
  const cancelPayload = { tableLabel: table.label, reason };
  if (table.mozo_id) {
    await createNotification({
      businessId: business.id,
      userId: table.mozo_id,
      type: "mesa.cancelled",
      payload: cancelPayload,
    });
  }
  // Broadcast to encargado so the manager always sees cancellations.
  await createNotification({
    businessId: business.id,
    targetRole: "encargado",
    type: "mesa.cancelled",
    payload: cancelPayload,
  });

  revalidatePath(`/${businessSlug}/mozo`);
  return actionOk(undefined);
}

// ── Asignación / transferencia de mozo (CU-09) ──────────────────

async function ensureUserIsMozoMember(
  service: GenericClient,
  businessId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await service
    .from("business_users")
    .select("role, disabled_at")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { role: string; disabled_at: string | null } | null;
  if (!row) return false;
  if (row.disabled_at) return false;
  return row.role === "mozo" || row.role === "encargado" || row.role === "admin";
}

export async function assignMozoToTable(
  tableId: string,
  mozoId: string | null,
  businessSlug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  if (!canAssignMozo(ctx.role)) {
    return actionError("Solo encargado o admin pueden asignar mozos.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const table = await loadTableForBusiness(service, tableId, business.id);
  if (!table) return actionError("Mesa no encontrada.");

  if (mozoId) {
    const isMember = await ensureUserIsMozoMember(service, business.id, mozoId);
    if (!isMember) return actionError("Usuario no es miembro activo del negocio.");
  }

  const from = table.mozo_id;
  if (from === mozoId) return actionOk(undefined); // no-op

  const { error } = await service
    .from("tables")
    .update({ mozo_id: mozoId })
    .eq("id", tableId);
  if (error) {
    console.error("assignMozoToTable", error);
    return actionError("No pudimos asignar el mozo.");
  }

  await insertAudit(service, {
    tableId,
    businessId: business.id,
    kind: "assignment",
    fromValue: from,
    toValue: mozoId,
    byUserId: ctx.userId,
  });

  revalidatePath(`/${businessSlug}/mozo`);
  return actionOk(undefined);
}

export async function transferTable(
  tableId: string,
  toMozoId: string,
  businessSlug: string,
  reason?: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const table = await loadTableForBusiness(service, tableId, business.id);
  if (!table) return actionError("Mesa no encontrada.");

  const fromMozoId = table.mozo_id;
  const isOrigen = fromMozoId !== null && fromMozoId === ctx.userId;
  const isSelfClaim = toMozoId === ctx.userId && !isOrigen;
  if (!canTransferTable(ctx.role, isOrigen, isSelfClaim)) {
    return actionError("No podés transferir una mesa que no tenés asignada.");
  }

  if (fromMozoId === toMozoId) {
    return actionError("La mesa ya está asignada a ese mozo.");
  }

  const isMember = await ensureUserIsMozoMember(service, business.id, toMozoId);
  if (!isMember) return actionError("El destino no es miembro activo del negocio.");

  const { error: updErr } = await service
    .from("tables")
    .update({ mozo_id: toMozoId })
    .eq("id", tableId);
  if (updErr) {
    console.error("transferTable update", updErr);
    return actionError("No pudimos transferir la mesa.");
  }

  await insertAudit(service, {
    tableId,
    businessId: business.id,
    kind: "transfer",
    fromValue: fromMozoId,
    toValue: toMozoId,
    byUserId: ctx.userId,
    reason: reason?.trim() || null,
  });

  // Notif al encargado (T5 CU-09).
  // Resolver nombres para el payload.
  const namesToFetch = [fromMozoId, toMozoId, ctx.userId].filter(
    (x): x is string => !!x,
  );
  const { data: members } = await service
    .from("business_users")
    .select("user_id, full_name")
    .eq("business_id", business.id)
    .in("user_id", namesToFetch);
  const nameById = new Map<string, string>();
  for (const m of (members ?? []) as Array<{
    user_id: string;
    full_name: string | null;
  }>) {
    if (m.full_name) nameById.set(m.user_id, m.full_name);
  }

  const transferPayload = {
    tableId,
    tableLabel: table.label,
    fromMozoId,
    fromName: fromMozoId ? (nameById.get(fromMozoId) ?? null) : null,
    toMozoId,
    toName: nameById.get(toMozoId) ?? null,
    transferredBy: ctx.userId,
    transferredByName: nameById.get(ctx.userId) ?? null,
    reason: reason?.trim() || null,
  };

  const { error: notifErr } = await service.from("notifications").insert({
    business_id: business.id,
    user_id: null,
    target_role: "encargado",
    type: "mesa.transferred",
    payload: transferPayload,
  });
  if (notifErr) {
    console.error("transferTable notification", notifErr);
    // No bloqueamos: la transferencia ya se hizo. El audit log queda como source of truth.
  }

  // Notify the destination mozo directly so they see the new table.
  await createNotification({
    businessId: business.id,
    userId: toMozoId,
    type: "mesa.transferred",
    payload: transferPayload,
  });

  // Notify the original mozo that their table was taken.
  if (fromMozoId && fromMozoId !== ctx.userId) {
    await createNotification({
      businessId: business.id,
      userId: fromMozoId,
      type: "mesa.transferred",
      payload: transferPayload,
    });
  }

  revalidatePath(`/${businessSlug}/mozo`);
  return actionOk(undefined);
}

