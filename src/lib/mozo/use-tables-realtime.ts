"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Suscripción realtime a cambios en `tables` para un business — cualquier
 * UPDATE invalida la página vía `router.refresh()`. Reemplaza el polling de
 * 10 s que tenían las vistas `/mozo` y `/admin/local`.
 *
 * `tables` no tiene business_id directo (viaja via floor_plans), así que el
 * filter del canal es por floor_plan_id si lo pasás; sino traemos todos los
 * cambios y filtramos client-side por la lista de floor_plans visibles.
 *
 * Patrón: postgres_changes UPDATE → router.refresh() → server re-fetcha →
 * props nuevas. Mismo flow que existía con polling, solo que el trigger es
 * el push de Supabase en lugar de un setInterval.
 *
 * Cierra DT-011. Migración 0040 sumó `tables` a supabase_realtime.
 */
export function useTablesRealtime({
  businessId,
  floorPlanIds,
}: {
  businessId: string;
  floorPlanIds: string[];
}) {
  const router = useRouter();
  const floorPlanIdsRef = useRef(floorPlanIds);
  floorPlanIdsRef.current = floorPlanIds;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      // Debounce: si llegan varios eventos seguidos (ej. un walk-in
      // dispara UPDATE en tables y INSERT en tables_audit_log), un solo
      // refresh los cubre. 200 ms es imperceptible.
      if (pendingRefresh) clearTimeout(pendingRefresh);
      pendingRefresh = setTimeout(() => {
        if (!cancelled) router.refresh();
        pendingRefresh = null;
      }, 200);
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel(`tables:${businessId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tables",
          },
          (payload) => {
            const row = payload.new as { floor_plan_id?: string };
            if (!row.floor_plan_id) return;
            if (!floorPlanIdsRef.current.includes(row.floor_plan_id)) return;
            scheduleRefresh();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tables",
          },
          (payload) => {
            const row = payload.new as { floor_plan_id?: string };
            if (!row.floor_plan_id) return;
            if (!floorPlanIdsRef.current.includes(row.floor_plan_id)) return;
            scheduleRefresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (pendingRefresh) clearTimeout(pendingRefresh);
      if (channel) supabase.removeChannel(channel);
    };
  }, [businessId, router]);
}
