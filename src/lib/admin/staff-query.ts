import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// ── Performance de mozos ──────────────────────────────────────────
//
// Cada cobro guarda `attributed_mozo_id` y `tip_cents` desagregado.
// Esto permite rankear mozos por ventas atribuidas, ticket y propina.

export type MozoPerformance = {
  mozoId: string;
  name: string;
  salesCents: number; // monto cobrado atribuido (sin propina)
  tipsCents: number;
  paymentCount: number;
  tipRatePct: number; // propina / ventas
};

export type StaffPerformance = {
  mozos: MozoPerformance[];
  totalTipsCents: number;
  totalSalesCents: number;
};

export async function getMozoPerformance(
  businessId: string,
  startIso: string,
  endIso: string,
): Promise<StaffPerformance> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("payments")
    .select("attributed_mozo_id, amount_cents, tip_cents")
    .eq("business_id", businessId)
    .eq("payment_status", "paid")
    .not("attributed_mozo_id", "is", null)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  const rows = (data ?? []) as Array<{
    attributed_mozo_id: string;
    amount_cents: number;
    tip_cents: number;
  }>;

  const agg = new Map<
    string,
    { salesCents: number; tipsCents: number; paymentCount: number }
  >();
  let totalTipsCents = 0;
  let totalSalesCents = 0;

  for (const r of rows) {
    const id = r.attributed_mozo_id;
    const sales = Number(r.amount_cents) || 0;
    const tips = Number(r.tip_cents) || 0;
    const existing = agg.get(id) ?? {
      salesCents: 0,
      tipsCents: 0,
      paymentCount: 0,
    };
    existing.salesCents += sales;
    existing.tipsCents += tips;
    existing.paymentCount += 1;
    agg.set(id, existing);
    totalTipsCents += tips;
    totalSalesCents += sales;
  }

  const mozoIds = [...agg.keys()];
  const nameById = new Map<string, string>();
  if (mozoIds.length > 0) {
    const { data: bu } = await supabase
      .from("business_users")
      .select("user_id, full_name")
      .eq("business_id", businessId)
      .in("user_id", mozoIds);
    for (const m of (bu ?? []) as {
      user_id: string;
      full_name: string | null;
    }[]) {
      if (m.full_name) nameById.set(m.user_id, m.full_name);
    }
  }

  const mozos: MozoPerformance[] = mozoIds
    .map((id) => {
      const v = agg.get(id)!;
      return {
        mozoId: id,
        name: nameById.get(id) ?? "Sin nombre",
        salesCents: v.salesCents,
        tipsCents: v.tipsCents,
        paymentCount: v.paymentCount,
        tipRatePct: v.salesCents > 0 ? (v.tipsCents / v.salesCents) * 100 : 0,
      };
    })
    .sort((a, b) => b.salesCents - a.salesCents);

  return { mozos, totalTipsCents, totalSalesCents };
}
