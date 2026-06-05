"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CajaAdminBoard } from "@/components/admin/local/caja-admin-board";
import { ComandasKanban } from "@/components/admin/local/comandas-kanban";
import { FichajeTab } from "@/components/admin/local/fichaje-tab";
import { RendicionMozosTab } from "@/components/admin/local/rendicion-mozos-tab";
import { SalonDesktop, type SalonOrderRef, type SalonReservationRef } from "@/components/admin/local/salon-desktop";
import { OrdersRealtimeBoard } from "@/components/admin/orders-realtime-board";
import type { LocalComanda, LocalStation } from "@/lib/admin/local-query";
import type { AdminOrder } from "@/lib/admin/orders-query";
import type { BusinessRole } from "@/lib/admin/context";
import type { FloorPlanWithTables } from "@/lib/admin/floor-plan/queries";
import type { Caja, CajaConEstado, CajaUserAssignment, MozoRendicion, RendicionMozoPendiente } from "@/lib/caja/types";
import type { MozoMember } from "@/lib/mozo/queries";
import type { PresentEmployee } from "@/lib/rrhh/clock-actions";
import type { TodaySummary } from "@/lib/rrhh/clock-queries";
import { cn } from "@/lib/utils";

type Tab = "pedidos" | "comandas" | "salon" | "caja" | "rendicion" | "fichaje";

function isTab(v: string | null | undefined): v is Tab {
  return v === "pedidos" || v === "comandas" || v === "salon" || v === "caja" || v === "rendicion" || v === "fichaje";
}

function TabsInner({
  slug,
  businessId,
  timezone,
  initialOrders,
  initialComandas,
  stations,
  floorPlans,
  dineInOrders,
  reservations,
  mozos,
  currentUserId,
  role,
  cajas,
  rendicionPendientes,
  rendicionHistorial,
  cajaAssignments,
  businessMembers,
  initialPresent,
  todaySummary,
}: {
  slug: string;
  businessId: string;
  timezone: string;
  initialOrders: AdminOrder[];
  initialComandas: LocalComanda[];
  stations: LocalStation[];
  floorPlans: FloorPlanWithTables[];
  dineInOrders: SalonOrderRef[];
  reservations: SalonReservationRef[];
  mozos: MozoMember[];
  currentUserId: string;
  role: BusinessRole;
  cajas: CajaConEstado[];
  rendicionPendientes: RendicionMozoPendiente[];
  rendicionHistorial: (MozoRendicion & { mozo_name: string; registered_by_name: string | null })[];
  cajaAssignments: (CajaUserAssignment & { user_name: string | null; caja_name: string })[];
  businessMembers: { user_id: string; full_name: string | null }[];
  initialPresent: PresentEmployee[];
  todaySummary?: TodaySummary;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  // Default = "salon" porque es la pantalla principal del operativo en local.
  // El parámetro de URL se omite solo cuando estás en la default (salón).
  const active: Tab = isTab(raw) ? raw : "salon";

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "salon") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : `?`, { scroll: false });
  };

  // Como todo /admin/local ahora es fullscreen, colapsamos el sidebar al
  // entrar a la pantalla (no solo al activar la tab Salón). Antes este
  // dispatch vivía dentro de SalonDesktop.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("admin-sidebar-collapse"));
  }, []);

  // Modo "Distribuir mozos": vivido en el shell para que el botón quede
  // alineado con las tabs en el header (en vez de dentro del SalonDesktop).
  const [distribuirOpen, setDistribuirOpen] = useState(false);
  // Necesitamos las mesas activas para el overlay. SalonDesktop también
  // las calcula, pero acá las planchamos desde floorPlans para el overlay.
  const allActiveTables = useMemo(
    () =>
      floorPlans.flatMap((fp) =>
        fp.tables.filter((t) => t.status === "active"),
      ),
    [floorPlans],
  );

  // Counters cheap — solo para la pill numérica del tab.
  const counts = useMemo(() => {
    const pedidosNuevos = initialOrders.filter((o) =>
      ["pending", "confirmed"].includes(o.status),
    ).length;
    const comandasActivas = initialComandas.filter(
      (c) => c.status !== "entregado",
    ).length;
    // Salón: mesas que NO están libres (ocupada + pidio_cuenta). Refleja
    // cuántas mesas requieren atención del encargado.
    const salonOcupadas = allActiveTables.filter(
      (t) => (t.operational_status ?? "libre") !== "libre",
    ).length;
    return {
      pedidos: pedidosNuevos,
      comandas: comandasActivas,
      salon: salonOcupadas,
      caja: cajas.length,
      rendicion: rendicionPendientes.filter((p) => p.pagos_count > 0).length,
      fichaje: initialPresent.length,
    };
  }, [initialOrders, initialComandas, allActiveTables, cajas.length, rendicionPendientes, initialPresent.length]);

  const tabsBar = (
    <nav
      aria-label="Secciones del operativo"
      className="inline-flex rounded-2xl bg-white p-1 ring-1 ring-zinc-200/70"
    >
      <TabButton
        active={active === "salon"}
        onClick={() => setTab("salon")}
        count={counts.salon}
      >
        Mesas
      </TabButton>
      <TabButton
        active={active === "comandas"}
        onClick={() => setTab("comandas")}
        count={counts.comandas}
      >
        Comandas
      </TabButton>
      <TabButton
        active={active === "pedidos"}
        onClick={() => setTab("pedidos")}
        count={counts.pedidos}
      >
        Pedidos online
      </TabButton>
      <TabButton
        active={active === "caja"}
        onClick={() => setTab("caja")}
        count={counts.caja}
      >
        Caja
      </TabButton>
      <TabButton
        active={active === "rendicion"}
        onClick={() => setTab("rendicion")}
        count={counts.rendicion}
      >
        Rendición
      </TabButton>
      <TabButton
        active={active === "fichaje"}
        onClick={() => setTab("fichaje")}
        count={counts.fichaje}
      >
        Fichaje
      </TabButton>
    </nav>
  );

  // Todas las tabs comparten layout fullscreen con header fijo (tabs +
  // acciones). Antes solo Salón era fullscreen; las otras quedaban dentro
  // del PageShell y se sentían apretadas. Ahora la pantalla "Local en vivo"
  // es una sola superficie densa, sin título redundante.
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-zinc-50 transition-[left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{ left: "var(--admin-sidebar-width, 72px)" }}
    >
      <div className="border-border/60 flex items-center justify-between gap-3 border-b bg-white/95 px-4 py-3 backdrop-blur">
        {tabsBar}
        {/* El botón "Distribuir mozos" se movió al header del sidebar de
            mesas dentro del salón (SalonDesktop → ActiveTablesList). El
            bell global vive en el admin layout. */}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {active === "salon" && (
          <SalonDesktop
            slug={slug}
            businessId={businessId}
            floorPlans={floorPlans}
            dineInOrders={dineInOrders}
            reservations={reservations}
            mozos={mozos}
            currentUserId={currentUserId}
            role={role}
            distribuirOpen={distribuirOpen}
            onDistribuirOpen={() => setDistribuirOpen(true)}
            onDistribuirClose={() => setDistribuirOpen(false)}
          />
        )}
        {active === "pedidos" && (
          <OrdersRealtimeBoard
            businessId={businessId}
            slug={slug}
            timezone={timezone}
            initialOrders={initialOrders}
          />
        )}
        {active === "comandas" && (
          <ComandasKanban
            slug={slug}
            businessId={businessId}
            initialComandas={initialComandas}
            stations={stations}
            mozos={mozos}
          />
        )}
        {active === "caja" && (
          <CajaAdminBoard
            slug={slug}
            cajas={cajas}
          />
        )}
        {active === "rendicion" && (
          <RendicionMozosTab
            slug={slug}
            initialPendientes={rendicionPendientes}
            initialHistorial={rendicionHistorial}
            cajas={cajas}
            cajaAssignments={cajaAssignments}
            members={businessMembers}
            showAssignments={role === "admin"}
          />
        )}
        {active === "fichaje" && (
          <FichajeTab
            slug={slug}
            initialPresent={initialPresent}
            todaySummary={todaySummary}
          />
        )}
      </div>

      {/* Modo "pintura" — vive directamente adentro de SalonDesktop como
          un slot del sidebar derecho (paint mode). El overlay legacy
          dejó de usarse. */}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
        active ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-900",
      )}
    >
      {children}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums",
          active
            ? "bg-white text-zinc-900 ring-1 ring-zinc-200"
            : "bg-zinc-100 text-zinc-500",
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function LocalShell(props: {
  slug: string;
  businessId: string;
  timezone: string;
  initialOrders: AdminOrder[];
  initialComandas: LocalComanda[];
  stations: LocalStation[];
  floorPlans: FloorPlanWithTables[];
  dineInOrders: SalonOrderRef[];
  reservations: SalonReservationRef[];
  mozos: MozoMember[];
  currentUserId: string;
  role: BusinessRole;
  cajas: CajaConEstado[];
  rendicionPendientes: RendicionMozoPendiente[];
  rendicionHistorial: (MozoRendicion & { mozo_name: string; registered_by_name: string | null })[];
  cajaAssignments: (CajaUserAssignment & { user_name: string | null; caja_name: string })[];
  businessMembers: { user_id: string; full_name: string | null }[];
  initialPresent: PresentEmployee[];
  todaySummary?: TodaySummary;
}) {
  return (
    <Suspense fallback={null}>
      <TabsInner {...props} />
    </Suspense>
  );
}
