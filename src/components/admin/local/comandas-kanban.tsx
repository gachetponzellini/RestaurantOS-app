"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Check, Package, Play, Truck, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import {
  advanceComandaStatus,
  marcarComandaEntregada,
} from "@/lib/comandas/actions";
import type { LocalComanda, LocalStation } from "@/lib/admin/local-query";
import type { ComandaStatus } from "@/lib/comandas/types";
import { mozoPalette } from "@/lib/mozo/colors";
import type { MozoMember } from "@/lib/mozo/queries";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// ─── Paleta de sectores (sort_order → color) ────────────────────────────────

const SECTOR_PALETTE = [
  { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" },
  { bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-500" },
  { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-pink-100", text: "text-pink-700", dot: "bg-pink-500" },
  { bg: "bg-lime-100", text: "text-lime-700", dot: "bg-lime-500" },
  { bg: "bg-teal-100", text: "text-teal-700", dot: "bg-teal-500" },
  { bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500" },
];
const FALLBACK = {
  bg: "bg-zinc-100",
  text: "text-zinc-700",
  dot: "bg-zinc-400",
};

// ─── Columnas (estilo idéntico al board de pedidos) ─────────────────────────

type Column = {
  id: ComandaStatus;
  label: string;
  accent: string;
  ring: string;
  countBg: string;
  countText: string;
  /** Color del botón de acción de la card. Matchea el estado actual de la
   *  comanda (no el próximo) para que la card lea como un bloque coherente. */
  buttonClass: string;
  emptyHint: string;
};

const COLUMNS: Column[] = [
  {
    id: "pendiente",
    label: "Pendiente",
    accent: "bg-amber-500",
    ring: "ring-amber-500/30",
    countBg: "bg-amber-50",
    countText: "text-amber-800",
    buttonClass: "bg-amber-500 hover:bg-amber-600 text-white",
    emptyHint: "Sin comandas pendientes",
  },
  {
    id: "en_preparacion",
    label: "En preparación",
    accent: "bg-sky-500",
    ring: "ring-sky-500/30",
    countBg: "bg-sky-50",
    countText: "text-sky-800",
    buttonClass: "bg-sky-500 hover:bg-sky-600 text-white",
    emptyHint: "Cocina libre",
  },
  {
    id: "entregado",
    label: "Entregadas",
    accent: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    countBg: "bg-emerald-50",
    countText: "text-emerald-800",
    buttonClass: "bg-emerald-500 hover:bg-emerald-600 text-white",
    emptyHint: "Aún no se entregó nada",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useElapsedMinutes(iso: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

/**
 * Mismo formato que el salón ("ahora", "5 min", "1h 20", "2h", "3 d") para
 * que el encargado lea el mismo lenguaje de tiempos en todas las tabs.
 */
function formatRelativeTime(minutes: number): string {
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours}h ${rest}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function elapsedTone(min: number, terminal: boolean): string {
  if (terminal) return "text-muted-foreground";
  if (min >= 15) return "text-rose-700";
  if (min >= 8) return "text-amber-700";
  return "text-muted-foreground";
}

function deliveryIcon(type: string) {
  if (type === "delivery") return Truck;
  if (type === "take_away") return Package;
  return UtensilsCrossed;
}

// ─── Componente principal ───────────────────────────────────────────────────

export function ComandasKanban({
  slug,
  businessId,
  initialComandas,
  stations,
  mozos,
}: {
  slug: string;
  businessId: string;
  initialComandas: LocalComanda[];
  stations: LocalStation[];
  mozos: MozoMember[];
}) {
  const router = useRouter();
  const [comandas, setComandas] = useState<LocalComanda[]>(initialComandas);
  useEffect(() => setComandas(initialComandas), [initialComandas]);

  // Mutaciones de estado en la card. Optimistic con rollback en error.
  // Realtime trae el cambio igualmente, pero el optimistic evita el flash.
  const [isPending, startTransition] = useTransition();

  const onEmpezar = (id: string) => {
    const prev = comandas;
    setComandas((cs) =>
      cs.map((c) => (c.id === id ? { ...c, status: "en_preparacion" } : c)),
    );
    startTransition(async () => {
      const res = await advanceComandaStatus(id, slug);
      if (!res.ok) {
        setComandas(prev);
        toast.error(res.error);
      }
    });
  };

  const onEntregar = (id: string) => {
    const prev = comandas;
    const nowIso = new Date().toISOString();
    setComandas((cs) =>
      cs.map((c) =>
        c.id === id
          ? { ...c, status: "entregado", delivered_at: nowIso }
          : c,
      ),
    );
    startTransition(async () => {
      const res = await marcarComandaEntregada(id, slug);
      if (!res.ok) {
        setComandas(prev);
        toast.error(res.error);
      }
    });
  };

  // ── Realtime sobre `comandas` ──
  const businessIdRef = useRef(businessId);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

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
        .channel(`comandas:${businessIdRef.current}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comandas",
          },
          () => {
            // Comandas no tiene business_id directo; el filter por business
            // viaja via JOIN en el server. router.refresh() re-fetchea con
            // permisos correctos.
            router.refresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  // Resolución de nombre del mozo → mismo patrón que SalonDesktop.
  const mozoNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of mozos) {
      if (x.full_name) m.set(x.user_id, x.full_name);
    }
    return m;
  }, [mozos]);

  // Mapas derivados.
  const stationStyleById = useMemo(() => {
    const out = new Map<string, (typeof SECTOR_PALETTE)[number]>();
    stations.forEach((s, idx) =>
      out.set(s.id, SECTOR_PALETTE[idx % SECTOR_PALETTE.length] ?? FALLBACK),
    );
    return out;
  }, [stations]);

  const stationStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stations) m.set(s.id, 0);
    for (const c of comandas) {
      if (c.status === "entregado") continue;
      m.set(c.station_id, (m.get(c.station_id) ?? 0) + 1);
    }
    return m;
  }, [comandas, stations]);

  const byColumn = useMemo(() => {
    const groups: Record<ComandaStatus, LocalComanda[]> = {
      pendiente: [],
      en_preparacion: [],
      entregado: [],
    };
    for (const c of comandas) {
      groups[c.status].push(c);
    }
    // Cap entregadas para que no crezca infinito en pantalla.
    groups.entregado = groups.entregado.slice(0, 20);
    return groups;
  }, [comandas]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Stats de saturación por sector ── */}
      <SectorStatsBar
        stations={stations}
        stationStats={stationStats}
        stationStyleById={stationStyleById}
      />

      {/* ── Kanban (mismo lenguaje visual que el board de pedidos) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = byColumn[col.id];
          return (
            <section
              key={col.id}
              className="bg-muted/30 ring-border/60 flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl p-3 ring-1"
            >
              <div className="flex flex-col gap-2">
                <div className={`h-1 w-10 rounded-full ${col.accent}`} />
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-foreground text-base font-bold tracking-tight">
                    {col.label}
                  </h2>
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${col.countBg} ${col.countText}`}
                  >
                    {items.length}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {items.map((c) => (
                  <ComandaCard
                    key={c.id}
                    comanda={c}
                    stationStyle={stationStyleById.get(c.station_id) ?? FALLBACK}
                    columnRing={col.ring}
                    buttonClass={col.buttonClass}
                    mozoName={c.mozo_id ? (mozoNameById.get(c.mozo_id) ?? null) : null}
                    onEmpezar={onEmpezar}
                    onEntregar={onEntregar}
                    isPending={isPending}
                  />
                ))}
                {items.length === 0 && (
                  <div className="border-border/60 text-muted-foreground/70 rounded-xl border border-dashed px-3 py-6 text-center text-xs">
                    {col.emptyHint}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stats por sector ───────────────────────────────────────────────────────

function SectorStatsBar({
  stations,
  stationStats,
  stationStyleById,
}: {
  stations: LocalStation[];
  stationStats: Map<string, number>;
  stationStyleById: Map<string, (typeof SECTOR_PALETTE)[number]>;
}) {
  if (stations.length === 0) {
    return (
      <div className="border-amber-200 bg-amber-50 text-amber-900 rounded-2xl border border-dashed p-3 text-sm">
        No hay sectores configurados. Cargá los sectores desde el catálogo
        para que las comandas se ruteen a cocina.
      </div>
    );
  }

  return (
    <div className="bg-card ring-border/60 rounded-2xl p-3 ring-1">
      <div className="text-muted-foreground mb-2 flex items-center gap-2">
        <ChefHat className="size-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">
          Saturación por sector
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {stations.map((s) => {
          const count = stationStats.get(s.id) ?? 0;
          const style = stationStyleById.get(s.id) ?? FALLBACK;
          return (
            <div
              key={s.id}
              className={`flex items-center justify-between rounded-xl px-3 py-2 ${style.bg}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                <span className={`text-xs font-semibold ${style.text}`}>
                  {s.name}
                </span>
              </div>
              <span className={`text-base font-bold tabular-nums ${style.text}`}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card de comanda ────────────────────────────────────────────────────────

function ComandaCard({
  comanda,
  stationStyle,
  columnRing,
  buttonClass,
  mozoName,
  onEmpezar,
  onEntregar,
  isPending,
}: {
  comanda: LocalComanda;
  stationStyle: (typeof SECTOR_PALETTE)[number];
  columnRing: string;
  buttonClass: string;
  mozoName: string | null;
  onEmpezar: (id: string) => void;
  onEntregar: (id: string) => void;
  isPending: boolean;
}) {
  const elapsed = useElapsedMinutes(comanda.emitted_at);
  const isTerminal = comanda.status === "entregado";

  const liveItems = comanda.items.filter((it) => !it.cancelled_at);
  const cancelledItems = comanda.items.filter((it) => it.cancelled_at);

  const ChannelIcon = deliveryIcon(comanda.delivery_type);

  // Etiqueta principal: mesa o customer.
  const origenLabel =
    comanda.delivery_type === "dine_in"
      ? `Mesa ${comanda.table_label ?? "?"}`
      : comanda.customer_name || "Pedido online";

  return (
    <article
      className={[
        "bg-card group relative flex flex-col gap-2 rounded-xl p-3 text-left transition-all",
        "shadow-[0_1px_2px_rgba(19,27,46,0.04)]",
        `ring-1 ${columnRing}`,
      ].join(" ")}
    >
      {/* Top row: origen + minutos + canal */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-foreground truncate text-base font-extrabold leading-none tracking-tight">
            {origenLabel}
          </span>
          <span
            className={`text-xs font-medium tabular-nums ${elapsedTone(elapsed, isTerminal)}`}
          >
            {formatRelativeTime(elapsed)}
          </span>
        </div>
        <ChannelIcon
          className="text-muted-foreground size-4 shrink-0"
          aria-label={comanda.delivery_type}
        />
      </header>

      {/* Mozo asignado — solo dine-in con mozo. Chip con su color del
          palette (mismo que en el salón) para mapear comanda → mozo de un
          vistazo, sin confundirse con los estados de mesa. */}
      {mozoName && comanda.mozo_id && (() => {
        const p = mozoPalette(comanda.mozo_id);
        return (
          <p
            className={`inline-flex max-w-full items-center gap-1 truncate self-start rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${p.bg} ${p.text} ${p.ring}`}
          >
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${p.dot}`} />
            <span className="truncate">{mozoName}</span>
          </p>
        );
      })()}

      {/* Sector + tanda + nº pedido */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase tracking-wide ${stationStyle.bg} ${stationStyle.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${stationStyle.dot}`} />
          {comanda.station_name}
        </span>
        <span className="text-muted-foreground/70 tabular-nums">
          tanda {comanda.batch} · #{comanda.order_number}
        </span>
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-1 pt-0.5">
        {liveItems.map((it) => (
          <li
            key={it.order_item_id}
            className="text-muted-foreground flex items-start gap-1.5 text-xs"
          >
            <span className="text-foreground/70 shrink-0 font-semibold tabular-nums">
              {it.quantity}×
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate font-medium">
                {it.product_name}
              </p>
              {it.modifiers.length > 0 && (
                <p className="text-muted-foreground/80 truncate text-[11px]">
                  {it.modifiers.join(" · ")}
                </p>
              )}
              {it.notes && (
                <p className="text-muted-foreground/80 truncate text-[11px] italic">
                  “{it.notes}”
                </p>
              )}
            </div>
          </li>
        ))}
        {cancelledItems.map((it) => (
          <li
            key={it.order_item_id}
            className="text-muted-foreground/50 flex items-start gap-1.5 text-[11px]"
          >
            <span className="shrink-0 font-semibold tabular-nums line-through">
              {it.quantity}×
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium line-through">
                {it.product_name}
              </p>
              {it.cancelled_reason && (
                <p className="text-rose-600/80 truncate no-underline">
                  Cancelado: {it.cancelled_reason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Footer: acción primaria. El tiempo va arriba (no se duplica abajo).
          Las entregadas (terminal) no tienen botón. El color matchea el
          estado actual de la card (no el próximo). */}
      {!isTerminal && (
        <div className="pt-1">
          {comanda.status === "pendiente" && (
            <button
              type="button"
              onClick={() => onEmpezar(comanda.id)}
              disabled={isPending}
              className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition active:translate-y-px disabled:opacity-50 ${buttonClass}`}
            >
              <Play className="size-3.5" strokeWidth={2.5} />
              Empezar
            </button>
          )}
          {comanda.status === "en_preparacion" && (
            <button
              type="button"
              onClick={() => onEntregar(comanda.id)}
              disabled={isPending}
              className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition active:translate-y-px disabled:opacity-50 ${buttonClass}`}
            >
              <Check className="size-3.5" strokeWidth={2.5} />
              Entregar
            </button>
          )}
        </div>
      )}
    </article>
  );
}
