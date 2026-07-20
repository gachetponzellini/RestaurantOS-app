import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { dispatchCustomerMessage } from "./customer-dispatch";
import {
  invoiceIssuedEmail,
  resolveBusinessBrand,
} from "./customer-email-templates";

/**
 * Aviso del comprobante fiscal al cliente tras la autorización de ARCA/AFIP
 * (spec 45). Best-effort: nunca lanza. Idempotente por `customer_message_log`
 * (`invoice_issued`, ref = invoice.id) → seguro llamarlo desde el emit síncrono
 * y desde el poll async sin duplicar. Sólo email hoy (sin template de WhatsApp).
 */
export async function notifyInvoiceIssued(params: {
  invoiceId: string;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();

    const { data: invoice } = await service
      .from("invoices")
      .select("id, business_id, order_id, numero, total_cents, tipo_comprobante")
      .eq("id", params.invoiceId)
      .maybeSingle();
    if (!invoice || !invoice.order_id) return;

    const { data: order } = await service
      .from("orders")
      .select("order_number, customer_name, customer_email, customer_phone")
      .eq("id", invoice.order_id)
      .maybeSingle();
    if (!order) return;

    const { data: business } = await service
      .from("businesses")
      .select("name, logo_url, address, phone, settings")
      .eq("id", invoice.business_id)
      .maybeSingle();
    if (!business) return;
    const brand = resolveBusinessBrand(business);

    const totalLabel = `$${(invoice.total_cents / 100).toLocaleString("es-AR")}`;
    const comprobanteLabel = invoice.numero
      ? `${invoice.tipo_comprobante} Nº ${invoice.numero}`
      : undefined;

    const email = invoiceIssuedEmail({
      brand,
      customerName: order.customer_name,
      orderNumber: order.order_number,
      totalLabel,
      comprobanteLabel,
    });

    await dispatchCustomerMessage({
      businessId: invoice.business_id,
      event: "invoice_issued",
      refId: invoice.id,
      recipient: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
      },
      whatsapp: null,
      email: {
        subject: email.subject,
        html: email.html,
        text: email.text,
        fromName: business.name,
      },
    });
  } catch (err) {
    console.error("notifyInvoiceIssued", err);
  }
}
