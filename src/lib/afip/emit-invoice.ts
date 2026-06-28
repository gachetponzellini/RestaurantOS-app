"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { canAnularFactura } from "@/lib/permissions/can";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

import { calculateAmounts } from "./calculate-amounts";
import type { AFIPProviderClient } from "./provider";
import {
  type ProviderSelection,
  selectProvider,
} from "./provider-config";
import { createSandboxClient } from "./sandbox";
import { createTusfacturasClient } from "./tusfacturas";
import type {
  AFIPConfig,
  Invoice,
  InvoiceResponse,
  TipoComprobante,
} from "./types";

type GenericClient = SupabaseClient;

const UNIQUE_VIOLATION = "23505";

type EmitInput = {
  orderId: string;
  paymentId?: string;
  tipoComprobante?: TipoComprobante;
  cuitReceptor?: string;
  razonSocialReceptor?: string;
  slug: string;
  /** Clave de idempotencia explícita (opcional); por defecto `${orderId}:${tipo}`. */
  idempotencyKey?: string;
};

type EmitResult = {
  invoice: Invoice;
};

/** Construye el cliente del provider a partir de la selección por modo fiscal. */
function buildProvider(
  selection: Exclude<ProviderSelection, { kind: "error" }>,
  businessId: string,
): AFIPProviderClient {
  if (selection.kind === "sandbox") return createSandboxClient(businessId);
  return createTusfacturasClient(selection.credentials);
}

async function loadAFIPConfig(
  service: GenericClient,
  businessId: string,
): Promise<AFIPConfig | null> {
  const { data } = await service
    .from("businesses")
    .select(
      "afip_cuit, afip_punto_venta, afip_provider, afip_default_tipo, afip_mode, afip_enabled, afip_provider_api_token, afip_provider_api_key, afip_provider_user_token",
    )
    .eq("id", businessId)
    .single();
  if (!data) return null;
  const row = data as {
    afip_cuit: string | null;
    afip_punto_venta: number | null;
    afip_provider: string | null;
    afip_default_tipo: string | null;
    afip_mode: string | null;
    afip_enabled: boolean | null;
    afip_provider_api_token: string | null;
    afip_provider_api_key: string | null;
    afip_provider_user_token: string | null;
  };
  if (!row.afip_cuit || !row.afip_punto_venta) return null;

  const hasCreds =
    row.afip_provider_api_token &&
    row.afip_provider_api_key &&
    row.afip_provider_user_token;

  return {
    cuit: row.afip_cuit,
    puntoVenta: row.afip_punto_venta,
    provider: (row.afip_provider ?? "tusfacturas") as AFIPConfig["provider"],
    defaultTipo: (row.afip_default_tipo ?? "factura_b") as TipoComprobante,
    mode: row.afip_mode === "produccion" ? "produccion" : "sandbox",
    enabled: Boolean(row.afip_enabled),
    credentials: hasCreds
      ? {
          apiToken: row.afip_provider_api_token!,
          apiKey: row.afip_provider_api_key!,
          userToken: row.afip_provider_user_token!,
        }
      : null,
  };
}

export async function emitInvoice(
  input: EmitInput,
): Promise<ActionResult<EmitResult>> {
  const business = await getBusiness(input.slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  // Config AFIP del negocio (CUIT, PV, modo, credenciales).
  const afipConfig = await loadAFIPConfig(service, business.id);
  if (!afipConfig) {
    return actionError(
      "AFIP no está configurado. Pedile al admin que cargue CUIT y punto de venta.",
    );
  }

  // Validar order.
  const { data: orderRow } = await service
    .from("orders")
    .select("id, business_id, total_cents, total_paid_cents, lifecycle_status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (
    !orderRow ||
    (orderRow as { business_id: string }).business_id !== business.id
  ) {
    return actionError("Orden no encontrada.");
  }
  const order = orderRow as { id: string; total_cents: number };

  const tipo = input.tipoComprobante ?? afipConfig.defaultTipo;

  // Factura A requiere CUIT receptor.
  if ((tipo === "factura_a" || tipo === "nota_credito_a") && !input.cuitReceptor) {
    return actionError("Para factura/NC tipo A se requiere CUIT del receptor.");
  }

  // Guard (spec 09): la orden ya tiene una factura autorizada VIGENTE de este
  // tipo. Sólo bloquea `status = 'authorized'`: si la factura previa quedó
  // `cancelled` (anulada con su nota de crédito), la orden se puede re-facturar.
  const { data: existingAuth } = await service
    .from("invoices")
    .select("*")
    .eq("order_id", input.orderId)
    .eq("tipo_comprobante", tipo)
    .eq("status", "authorized")
    .maybeSingle();
  if (existingAuth) {
    return actionError("Esta orden ya tiene una factura autorizada.");
  }

  // Selección de provider según modo fiscal. En producción sin credenciales,
  // NO se llama al provider externo.
  const selection = selectProvider(afipConfig);
  if (selection.kind === "error") return actionError(selection.message);
  const providerName = selection.kind === "sandbox" ? "sandbox" : "tusfacturas";

  const amounts = calculateAmounts(order.total_cents);
  const idempotencyKey = input.idempotencyKey ?? `${input.orderId}:${tipo}`;

  // ── RESERVA ──────────────────────────────────────────────────────
  // Insertamos un comprobante `pending` ANTES de llamar al provider. El índice
  // único parcial (business, order, tipo) where status in (pending, authorized)
  // garantiza que un doble click / reintento concurrente no genere una segunda
  // emisión: el segundo insert choca y reusamos el comprobante existente.
  const { data: reserved, error: resErr } = await service
    .from("invoices")
    .insert({
      business_id: business.id,
      order_id: input.orderId,
      payment_id: input.paymentId ?? null,
      tipo_comprobante: tipo,
      punto_venta: afipConfig.puntoVenta,
      numero: null,
      cuit_receptor: input.cuitReceptor ?? null,
      razon_social_receptor: input.razonSocialReceptor ?? null,
      total_cents: amounts.totalCents,
      neto_cents: amounts.netoCents,
      iva_cents: amounts.ivaCents,
      iva_rate: amounts.ivaRate,
      status: "pending",
      provider: providerName,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  if (resErr || !reserved) {
    if ((resErr as PostgrestError | null)?.code === UNIQUE_VIOLATION) {
      // Ya hay un comprobante vigente para esta orden+tipo.
      const { data: current } = await service
        .from("invoices")
        .select("*")
        .eq("order_id", input.orderId)
        .eq("tipo_comprobante", tipo)
        .in("status", ["pending", "authorized"])
        .maybeSingle();
      if (current) {
        const cur = current as Invoice;
        if (cur.status === "authorized") {
          return actionError("Esta orden ya tiene una factura autorizada.");
        }
        // Emisión en curso: devolvemos el comprobante existente (idempotente).
        return actionOk({ invoice: cur });
      }
    }
    return actionError(`Error reservando factura: ${resErr?.message}`);
  }
  const reservedInvoice = reserved as Invoice;

  // ── EMITIR ───────────────────────────────────────────────────────
  const provider = buildProvider(selection, business.id);
  let providerResult: InvoiceResponse;
  try {
    providerResult = await provider.emit({
      tipo,
      puntoVenta: afipConfig.puntoVenta,
      cuitEmisor: afipConfig.cuit,
      cuitReceptor: input.cuitReceptor,
      razonSocialReceptor: input.razonSocialReceptor,
      totalCents: order.total_cents,
      concepto: "productos",
    });
  } catch (err) {
    providerResult = {
      success: false,
      error: `Error de red con el provider: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── CONFIRMAR ────────────────────────────────────────────────────
  const status = providerResult.success ? "authorized" : "failed";
  const { data: updated, error: updErr } = await service
    .from("invoices")
    .update({
      status,
      numero: providerResult.numero ?? null,
      cae: providerResult.cae ?? null,
      cae_vencimiento: providerResult.caeVencimiento ?? null,
      error_message: providerResult.error ?? null,
      provider_response: providerResult.rawResponse ?? null,
    })
    .eq("id", reservedInvoice.id)
    .select()
    .single();

  if (updErr || !updated) {
    return actionError(`Error guardando factura: ${updErr?.message}`);
  }
  const invoice = updated as Invoice;

  if (!providerResult.success) {
    return actionError(
      `AFIP rechazó el comprobante: ${providerResult.error ?? "error desconocido"}`,
    );
  }

  return actionOk({ invoice });
}

export async function retryInvoice(
  invoiceId: string,
  slug: string,
): Promise<ActionResult<EmitResult>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;
  if (ctx.role !== "admin" && ctx.role !== "encargado") {
    return actionError("Solo admin o encargado pueden reintentar facturas.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: invoiceRow } = await service
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (
    !invoiceRow ||
    (invoiceRow as { business_id: string }).business_id !== business.id
  ) {
    return actionError("Factura no encontrada.");
  }
  const inv = invoiceRow as Invoice;
  if (inv.status !== "failed") {
    return actionError("Solo se pueden reintentar facturas fallidas.");
  }

  const afipConfig = await loadAFIPConfig(service, business.id);
  if (!afipConfig) return actionError("AFIP no configurado.");

  const selection = selectProvider(afipConfig);
  if (selection.kind === "error") return actionError(selection.message);

  const provider = buildProvider(selection, business.id);
  let providerResult: InvoiceResponse;
  try {
    providerResult = await provider.emit({
      tipo: inv.tipo_comprobante,
      puntoVenta: inv.punto_venta,
      cuitEmisor: afipConfig.cuit,
      cuitReceptor: inv.cuit_receptor ?? undefined,
      razonSocialReceptor: inv.razon_social_receptor ?? undefined,
      totalCents: inv.total_cents,
      concepto: "productos",
    });
  } catch (err) {
    providerResult = {
      success: false,
      error: `Error de red con el provider: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const newStatus = providerResult.success ? "authorized" : "failed";

  const { error: updErr } = await service
    .from("invoices")
    .update({
      status: newStatus,
      cae: providerResult.cae ?? inv.cae,
      cae_vencimiento: providerResult.caeVencimiento ?? inv.cae_vencimiento,
      numero: providerResult.numero ?? inv.numero,
      error_message: providerResult.error ?? null,
      provider_response: providerResult.rawResponse ?? null,
    })
    .eq("id", invoiceId);

  if (updErr) {
    // Otro comprobante vigente ganó la carrera (índice único parcial).
    if ((updErr as PostgrestError).code === UNIQUE_VIOLATION) {
      return actionError("Esta orden ya tiene una factura autorizada.");
    }
    return actionError(`Error guardando reintento: ${updErr.message}`);
  }

  if (!providerResult.success) {
    return actionError(
      `Reintento fallido: ${providerResult.error ?? "error desconocido"}`,
    );
  }

  const { data: updated } = await service
    .from("invoices")
    .select()
    .eq("id", invoiceId)
    .single();

  return actionOk({ invoice: updated as Invoice });
}

/** Factura → nota de crédito del mismo tipo fiscal (A↔A, B↔B). */
const NC_TIPO: Partial<Record<TipoComprobante, TipoComprobante>> = {
  factura_a: "nota_credito_a",
  factura_b: "nota_credito_b",
};

type AnularInput = {
  invoiceId: string;
  motivo: string;
  slug: string;
};

type AnularResult = {
  /** Factura original, ya con `status = 'cancelled'` y motivo persistido. */
  original: Invoice;
  /** Nota de crédito emitida que respalda la anulación. */
  notaCredito: Invoice;
};

/**
 * Anula un comprobante `authorized` (spec 09). En AR no se "borra" una factura:
 * se emite la **nota de crédito** asociada y la original queda `cancelled` con
 * el motivo persistido. Permiso: encargado/admin (el mozo no anula). Habilita
 * re-facturar la orden, porque el guard de `emitInvoice` deja de ver una
 * factura `authorized` vigente.
 */
export async function anularFactura(
  input: AnularInput,
): Promise<ActionResult<AnularResult>> {
  const business = await getBusiness(input.slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canAnularFactura(ctxResult.data.role)) {
    return actionError("Solo encargado o admin pueden anular facturas.");
  }

  const motivo = input.motivo.trim();
  if (!motivo) {
    return actionError("El motivo de anulación es obligatorio.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: invoiceRow } = await service
    .from("invoices")
    .select("*")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (
    !invoiceRow ||
    (invoiceRow as { business_id: string }).business_id !== business.id
  ) {
    return actionError("Factura no encontrada.");
  }
  const original = invoiceRow as Invoice;

  if (original.status !== "authorized") {
    return actionError(
      "Solo se pueden anular comprobantes autorizados. Las facturas fallidas se descartan o reintentan.",
    );
  }

  const ncTipo = NC_TIPO[original.tipo_comprobante];
  if (!ncTipo) {
    return actionError("Este comprobante no se puede anular con nota de crédito.");
  }

  const afipConfig = await loadAFIPConfig(service, business.id);
  if (!afipConfig) return actionError("AFIP no configurado.");

  const selection = selectProvider(afipConfig);
  if (selection.kind === "error") return actionError(selection.message);
  const providerName = selection.kind === "sandbox" ? "sandbox" : "tusfacturas";

  // Emitir la nota de crédito por el mismo total que la factura original.
  const provider = buildProvider(selection, business.id);
  let providerResult: InvoiceResponse;
  try {
    providerResult = await provider.emit({
      tipo: ncTipo,
      puntoVenta: afipConfig.puntoVenta,
      cuitEmisor: afipConfig.cuit,
      cuitReceptor: original.cuit_receptor ?? undefined,
      razonSocialReceptor: original.razon_social_receptor ?? undefined,
      totalCents: original.total_cents,
      concepto: "productos",
    });
  } catch (err) {
    providerResult = {
      success: false,
      error: `Error de red con el provider: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!providerResult.success) {
    // La factura original NO cambia de estado si la NC no se pudo emitir.
    return actionError(
      `No se pudo emitir la nota de crédito: ${providerResult.error ?? "error desconocido"}`,
    );
  }

  const amounts = calculateAmounts(original.total_cents);

  // Persistir la nota de crédito como fila propia, linkeada a la factura que
  // anula (cancels_invoice_id). Distinto tipo_comprobante ⇒ no choca con el
  // índice único parcial de comprobantes vigentes por orden.
  const { data: ncRow, error: ncErr } = await service
    .from("invoices")
    .insert({
      business_id: business.id,
      order_id: original.order_id,
      payment_id: original.payment_id,
      tipo_comprobante: ncTipo,
      punto_venta: afipConfig.puntoVenta,
      numero: providerResult.numero ?? null,
      cae: providerResult.cae ?? null,
      cae_vencimiento: providerResult.caeVencimiento ?? null,
      cuit_receptor: original.cuit_receptor,
      razon_social_receptor: original.razon_social_receptor,
      total_cents: amounts.totalCents,
      neto_cents: amounts.netoCents,
      iva_cents: amounts.ivaCents,
      iva_rate: amounts.ivaRate,
      status: "authorized",
      provider: providerName,
      provider_response: providerResult.rawResponse ?? null,
      idempotency_key: `anular:${original.id}`,
      cancels_invoice_id: original.id,
    })
    .select()
    .single();

  if (ncErr || !ncRow) {
    return actionError(`Error guardando la nota de crédito: ${ncErr?.message}`);
  }
  const notaCredito = ncRow as Invoice;

  // Marcar la factura original como anulada + persistir el motivo.
  const { data: cancelledRow, error: cancelErr } = await service
    .from("invoices")
    .update({
      status: "cancelled",
      cancelled_reason: motivo,
      cancelled_by: ctxResult.data.userId, // spec 34 — responsable de la anulación
    })
    .eq("id", original.id)
    .select()
    .single();

  if (cancelErr || !cancelledRow) {
    return actionError(
      `Nota de crédito emitida pero no se pudo marcar la factura: ${cancelErr?.message}`,
    );
  }

  return actionOk({
    original: cancelledRow as Invoice,
    notaCredito,
  });
}
