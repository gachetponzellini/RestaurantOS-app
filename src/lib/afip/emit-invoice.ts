"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

import { calculateAmounts } from "./calculate-amounts";
import type { AFIPProviderClient } from "./provider";
import { createSandboxClient } from "./sandbox";
import { createTusfacturasClient } from "./tusfacturas";
import type { AFIPConfig, Invoice, TipoComprobante } from "./types";

type GenericClient = SupabaseClient;

type EmitInput = {
  orderId: string;
  paymentId?: string;
  tipoComprobante?: TipoComprobante;
  cuitReceptor?: string;
  razonSocialReceptor?: string;
  slug: string;
};

type EmitResult = {
  invoice: Invoice;
};

function getProvider(name: string, businessId: string): AFIPProviderClient {
  if (name === "sandbox") return createSandboxClient(businessId);
  return createTusfacturasClient();
}

async function loadAFIPConfig(
  service: GenericClient,
  businessId: string,
): Promise<AFIPConfig | null> {
  const { data } = await service
    .from("businesses")
    .select("afip_cuit, afip_punto_venta, afip_provider, afip_default_tipo")
    .eq("id", businessId)
    .single();
  if (!data) return null;
  const row = data as {
    afip_cuit: string | null;
    afip_punto_venta: number | null;
    afip_provider: string | null;
    afip_default_tipo: string | null;
  };
  if (!row.afip_cuit || !row.afip_punto_venta) return null;
  return {
    cuit: row.afip_cuit,
    puntoVenta: row.afip_punto_venta,
    provider: (row.afip_provider ?? "tusfacturas") as AFIPConfig["provider"],
    defaultTipo: (row.afip_default_tipo ?? "factura_b") as TipoComprobante,
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

  // Config AFIP del negocio
  const afipConfig = await loadAFIPConfig(service, business.id);
  if (!afipConfig) {
    return actionError(
      "AFIP no está configurado. Pedile al admin que cargue CUIT y punto de venta.",
    );
  }

  // Validar order
  const { data: orderRow } = await service
    .from("orders")
    .select("id, business_id, total_cents, total_paid_cents, lifecycle_status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!orderRow || (orderRow as { business_id: string }).business_id !== business.id) {
    return actionError("Orden no encontrada.");
  }
  const order = orderRow as {
    id: string;
    total_cents: number;
    total_paid_cents: number;
    lifecycle_status: string;
  };

  // Verificar que no esté ya facturada
  const { data: existing } = await service
    .from("invoices")
    .select("id")
    .eq("order_id", input.orderId)
    .eq("status", "authorized")
    .maybeSingle();
  if (existing) {
    return actionError("Esta orden ya tiene una factura autorizada.");
  }

  const tipo = input.tipoComprobante ?? afipConfig.defaultTipo;

  // Factura A requiere CUIT receptor
  if ((tipo === "factura_a" || tipo === "nota_credito_a") && !input.cuitReceptor) {
    return actionError("Para factura/NC tipo A se requiere CUIT del receptor.");
  }

  const totalCents = order.total_cents;
  const amounts = calculateAmounts(totalCents);

  // Emitir via provider
  const provider = getProvider(afipConfig.provider, business.id);
  const providerResult = await provider.emit({
    tipo,
    puntoVenta: afipConfig.puntoVenta,
    cuitEmisor: afipConfig.cuit,
    cuitReceptor: input.cuitReceptor,
    razonSocialReceptor: input.razonSocialReceptor,
    totalCents,
    concepto: "productos",
  });

  const status = providerResult.success ? "authorized" : "failed";

  const { data: inserted, error: insErr } = await service
    .from("invoices")
    .insert({
      business_id: business.id,
      order_id: input.orderId,
      payment_id: input.paymentId ?? null,
      tipo_comprobante: tipo,
      punto_venta: afipConfig.puntoVenta,
      numero: providerResult.numero ?? 0,
      cae: providerResult.cae ?? null,
      cae_vencimiento: providerResult.caeVencimiento ?? null,
      cuit_receptor: input.cuitReceptor ?? null,
      razon_social_receptor: input.razonSocialReceptor ?? null,
      total_cents: amounts.totalCents,
      neto_cents: amounts.netoCents,
      iva_cents: amounts.ivaCents,
      iva_rate: amounts.ivaRate,
      status,
      error_message: providerResult.error ?? null,
      provider: afipConfig.provider,
      provider_response: providerResult.rawResponse ?? null,
    })
    .select()
    .single();

  if (insErr || !inserted) {
    return actionError(`Error guardando factura: ${insErr?.message}`);
  }

  const invoice = inserted as Invoice;

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
  if (!invoiceRow || (invoiceRow as { business_id: string }).business_id !== business.id) {
    return actionError("Factura no encontrada.");
  }
  const inv = invoiceRow as Invoice;
  if (inv.status !== "failed") {
    return actionError("Solo se pueden reintentar facturas fallidas.");
  }

  const afipConfig = await loadAFIPConfig(service, business.id);
  if (!afipConfig) return actionError("AFIP no configurado.");

  const provider = getProvider(afipConfig.provider, business.id);
  const providerResult = await provider.emit({
    tipo: inv.tipo_comprobante,
    puntoVenta: inv.punto_venta,
    cuitEmisor: afipConfig.cuit,
    cuitReceptor: inv.cuit_receptor ?? undefined,
    razonSocialReceptor: inv.razon_social_receptor ?? undefined,
    totalCents: inv.total_cents,
    concepto: "productos",
  });

  const newStatus = providerResult.success ? "authorized" : "failed";

  await service
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
