"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bike, ChevronRight, Clock, MapPin, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { updateKitchenStatusForOrder } from "@/lib/cocina/actions";

// ─── Types ───────────────────────────────────────────────────────────────────

type KitchenStatus = "pending" | "preparing" | "ready" | "delivered";

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  notes: string | null;
  kitchen_status: KitchenStatus;
};

export type OrderForCocina = {
  id: string;
  order_number: number;
  delivery_type: string;
  created_at: string;
  customer_name: string;
  total_cents: number;
  table: { label: string } | null;
  items: OrderItem[];
};

type Props = {
  businessSlug: string;
  businessName: string;
  orders: OrderForCocina[];
};

// ─── Config ──────────────────────────────────────────────────────────────────

type DeliveryType = "dine_in" | "delivery" | "pickup";

const ORIGEN: Record<DeliveryType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pill: string;
}> = {
  dine_in:  { label: "Mesa",     icon: MapPin,      pill: "bg-emerald-100 text-emerald-700" },
  delivery: { label: "Delivery", icon: Bike,         pill: "bg-sky-100 text-sky-700" },
  pickup:   { label: "Take-away",icon: ShoppingBag,  pill: "bg-violet-100 text-violet-700" },
};

const COLUMNAS: {
  key: KitchenStatus;
  label: string;
  emptyLabel: string;
  colBg: string;
  headerDot: string;
  headerText: string;
  countPill: string;
}[] = [
  {
    key: "pending",
    label: "Pendiente",
    emptyLabel: "Sin comandas pendientes",
    colBg: "bg-zinc-100/70",
    headerDot: "bg-zinc-400",
    headerText: "text-zinc-700",
    countPill: "bg-zinc-200 text-zinc-700",
  },
  {
    key: "preparing",
    label: "En preparación",
    emptyLabel: "Nada en preparación",
    colBg: "bg-amber-50/70",
    headerDot: "bg-amber-500",
    headerText: "text-amber-800",
    countPill: "bg-amber-100 text-amber-800",
  },
  {
    key: "ready",
    label: "Listo para retirar",
    emptyLabel: "Sin platos listos",
    colBg: "bg-emerald-50/70",
    headerDot: "bg-emerald-500",
    headerText: "text-emerald-800",
    countPill: "bg-emerald-100 text-emerald-800",
  },
];

const STATUS_NEXT: Record<KitchenStatus, KitchenStatus> = {
  pending: "preparing",
  preparing: "ready",
  ready: "delivered",
  delivered: "delivered",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minutesSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
}

function ticketStatus(items: OrderItem[]): KitchenStatus {
  if (items.some((i) => i.kitchen_status === "pending"))   return "pending";
  if (items.some((i) => i.kitchen_status === "preparing")) return "preparing";
  if (items.some((i) => i.kitchen_status === "ready"))     return "ready";
  return "delivered";
}

function TimeBadge({ min }: { min: number }) {
  const cls =
    min < 10
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : min < 20
        ? "bg-amber-50 text-amber-700 ring-amber-300"
        : "bg-red-50 text-red-700 ring-red-300";
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ring-1 tabular-nums ${cls}`}>
      <Clock className="h-3.5 w-3.5" />
      {min}m
    </span>
  );
}

function UrgencyBar({ min }: { min: number }) {
  if (min < 10) return null;
  const cls = min < 20 ? "bg-amber-400" : "bg-red-500";
  return <div className={`h-1 w-full rounded-t-xl ${cls}`} />;
}

// ─── Ticket Card ─────────────────────────────────────────────────────────────

function TicketCard({
  order,
  onAdvance,
  disabled,
}: {
  order: OrderForCocina;
  onAdvance: (orderId: string) => void;
  disabled: boolean;
}) {
  const activeItems = order.items.filter((i) => i.kitchen_status !== "delivered");
  const status = ticketStatus(activeItems);
  const min = minutesSince(order.created_at);

  const dtype = (order.delivery_type as DeliveryType) in ORIGEN
    ? (order.delivery_type as DeliveryType)
    : "pickup";
  const origen = ORIGEN[dtype];
  const OriginIcon = origen.icon;

  const ref =
    order.delivery_type === "dine_in" && order.table
      ? `Mesa ${order.table.label}`
      : `#${String(order.order_number).padStart(4, "0")}`;

  const actionConfig = {
    pending:   { label: "Empezar",       cls: "bg-zinc-900 hover:bg-zinc-700 text-white" },
    preparing: { label: "Marcar listo",  cls: "bg-amber-500 hover:bg-amber-400 text-white" },
    ready:     { label: "Entregado",     cls: "bg-emerald-600 hover:bg-emerald-500 text-white" },
    delivered: { label: "Entregado",     cls: "bg-zinc-100 text-zinc-400" },
  }[status];

  const totalItems = activeItems.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md">
      <UrgencyBar min={min} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${origen.pill}`}>
            <OriginIcon className="h-3 w-3" />
            {origen.label}
          </span>
        </div>
        <TimeBadge min={min} />
      </div>

      {/* Referencia */}
      <div className="px-4 pb-1">
        <h3 className="font-heading text-2xl font-bold leading-none">{ref}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {order.customer_name}
          <span className="mx-1.5 text-zinc-300">·</span>
          <span className="tabular-nums">{totalItems} {totalItems === 1 ? "plato" : "platos"}</span>
        </p>
      </div>

      {/* Items */}
      <ul className="mx-4 mt-3 space-y-2 border-t pt-3">
        {activeItems.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-xs font-bold text-zinc-700">
              {item.quantity}
            </span>
            <div className="min-w-0">
              <p className="font-medium leading-snug">{item.product_name}</p>
              {item.notes && (
                <p className="text-xs italic text-muted-foreground">↳ {item.notes}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Action */}
      {status !== "delivered" && (
        <div className="p-4 pt-3">
          <button
            disabled={disabled}
            onClick={() => onAdvance(order.id)}
            className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition disabled:opacity-50 ${actionConfig.cls}`}
          >
            {actionConfig.label}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CocinaClient({ businessSlug, businessName, orders }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(id);
  }, [router]);

  function handleAdvance(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const activeItems = order.items.filter((i) => i.kitchen_status !== "delivered");
    const next = STATUS_NEXT[ticketStatus(activeItems)];
    if (next === ticketStatus(activeItems)) return;

    startTransition(async () => {
      const result = await updateKitchenStatusForOrder(orderId, next, businessSlug);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  const activeOrders = orders.filter((o) =>
    o.items.some((i) => i.kitchen_status !== "delivered"),
  );

  const times = activeOrders.map((o) => minutesSince(o.created_at));
  const promedio = times.length
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : 0;
  const listos = activeOrders.filter(
    (o) => ticketStatus(o.items.filter((i) => i.kitchen_status !== "delivered")) === "ready",
  ).length;
  const urgentes = times.filter((t) => t >= 20).length;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900">
              <UtensilsCrossed className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {businessName}
              </p>
              <h1 className="font-heading text-xl font-semibold leading-none">Cocina</h1>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center divide-x rounded-xl border bg-white shadow-sm">
            <Stat label="En curso" value={activeOrders.length} />
            <Stat label="Tiempo prom." value={`${promedio}m`} />
            <Stat label="Listos" value={listos} highlight={listos > 0 ? "emerald" : undefined} />
            {urgentes > 0 && (
              <Stat label="Urgentes" value={urgentes} highlight="red" />
            )}
          </div>
        </div>
      </header>

      {/* Kanban */}
      <div className="mx-auto max-w-[1600px] grid gap-4 px-6 py-5 lg:grid-cols-3">
        {COLUMNAS.map((col) => {
          const colOrders = activeOrders.filter((o) => {
            const s = ticketStatus(o.items.filter((i) => i.kitchen_status !== "delivered"));
            return s === col.key;
          });

          return (
            <div key={col.key} className={`rounded-2xl p-3 ${col.colBg}`}>
              {/* Column header */}
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={`h-2.5 w-2.5 rounded-full ${col.headerDot}`} />
                <h2 className={`font-heading text-sm font-semibold ${col.headerText}`}>
                  {col.label}
                </h2>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${col.countPill}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {colOrders
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((o) => (
                    <TicketCard
                      key={o.id}
                      order={o}
                      onAdvance={handleAdvance}
                      disabled={pending}
                    />
                  ))}

                {colOrders.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-400">
                    {col.emptyLabel}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "emerald" | "red";
}) {
  const valClass =
    highlight === "emerald"
      ? "text-emerald-600"
      : highlight === "red"
        ? "text-red-600"
        : "text-zinc-900";
  return (
    <div className="px-4 py-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-bold tabular-nums ${valClass}`}>{value}</p>
    </div>
  );
}
