"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserMinus, X } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { assignMozoToTable } from "@/lib/mozo/actions";
import type { FloorPlanWithTables } from "@/lib/admin/floor-plan/queries";
import { initialsFromName, mozoColor } from "@/lib/mozo/colors";
import type { MozoMember } from "@/lib/mozo/queries";
import type { FloorTable } from "@/lib/reservations/types";
import { cn } from "@/lib/utils";

import { type TableExtra } from "./floor-plan-viewer";

type Props = {
  open: boolean;
  onClose: () => void;
  slug: string;
  floorPlans: FloorPlanWithTables[];
  mozos: MozoMember[];
  /**
   * Mesas con su `mozo_id` actual. El componente las espeja en estado local
   * para optimistic update — el server confirma al refrescar.
   */
  tables: FloorTable[];
};

/**
 * Modo "pintura": el encargado/admin elige un mozo en la sidebar, y cada tap
 * sobre una mesa la asigna a ese mozo. Tap sobre una mesa ya asignada al
 * mozo activo la desasigna. Persistencia inmediata (cada tap → action).
 *
 * La asignación es **fija**: persiste hasta que se cambia manualmente.
 * Cobrar / anular una mesa NO la desasigna (decisión 2026-05-08).
 */
export function AsignarMozosOverlay({
  open,
  onClose,
  slug,
  floorPlans,
  mozos,
  tables,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Estado local del mozo activo en la "paleta".
  // null = "Sin asignar" (próximo tap desasigna la mesa).
  const [activeMozoId, setActiveMozoId] = useState<string | null>(
    mozos.find((m) => m.role === "mozo")?.user_id ?? mozos[0]?.user_id ?? null,
  );
  const [activePlanId, setActivePlanId] = useState<string | null>(
    floorPlans[0]?.plan.id ?? null,
  );

  // Espejo local de mozo_id por tableId para optimistic update.
  const [localAssign, setLocalAssign] = useState<Record<string, string | null>>(
    () => {
      const m: Record<string, string | null> = {};
      for (const t of tables) m[t.id] = t.mozo_id ?? null;
      return m;
    },
  );

  // Solo mozos (no admin/encargado) son target de asignación: la pantalla es
  // para distribuir mesas entre quienes atienden, no entre todos los miembros.
  const targetMozos = useMemo(
    () => mozos.filter((m) => m.role === "mozo"),
    [mozos],
  );

  const countByMozo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const id of Object.values(localAssign)) {
      if (id) c[id] = (c[id] ?? 0) + 1;
    }
    return c;
  }, [localAssign]);

  const totalSinAsignar = useMemo(
    () =>
      tables.filter((t) => t.status === "active" && !localAssign[t.id]).length,
    [tables, localAssign],
  );

  const colorForMozo = (mozoId: string) => mozoColor(mozoId);

  const handleTableClick = (table: FloorTable) => {
    const currentAssigned = localAssign[table.id] ?? null;
    // Si se tocó una mesa con el mismo mozo activo: desasignar (toggle).
    const next =
      currentAssigned === activeMozoId ? null : activeMozoId;

    // Optimistic update.
    setLocalAssign((prev) => ({ ...prev, [table.id]: next }));

    startTransition(async () => {
      const r = await assignMozoToTable(table.id, next, slug);
      if (!r.ok) {
        toast.error(r.error);
        // Rollback.
        setLocalAssign((prev) => ({ ...prev, [table.id]: currentAssigned }));
        return;
      }
    });
  };

  const handleClose = () => {
    router.refresh();
    onClose();
  };

  const activePlan = floorPlans.find((fp) => fp.plan.id === activePlanId);

  // Extras para el viewer: cada mesa pintada con el color de su mozo asignado.
  const extras: Record<string, TableExtra> = {};
  if (activePlan) {
    for (const t of activePlan.tables) {
      const mozoId = localAssign[t.id];
      if (mozoId) {
        const mozoName = mozos.find((m) => m.user_id === mozoId)?.full_name;
        extras[t.id] = {
          mozoInitial: initialsFromName(mozoName ?? "?"),
        };
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 bg-white p-0 sm:max-w-3xl"
      >
        {/* Header — mismo lenguaje que los otros drawers (TableDetail,
            OrderDetailSheet): title + acciones a la derecha + close button. */}
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Modo pintura
            </p>
            <SheetTitle className="text-lg font-semibold tracking-tight text-zinc-900">
              Distribuir mozos
            </SheetTitle>
          </div>
          <div className="flex items-center gap-2">
            {totalSinAsignar > 0 && (
              <span className="hidden items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 sm:inline-flex">
                {totalSinAsignar} sin asignar
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition hover:brightness-95 active:translate-y-px"
              style={{
                background: "var(--brand, #18181B)",
                color: "var(--brand-foreground, white)",
              }}
            >
              <Check className="size-4" />
              Listo
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="hover:bg-muted -mr-1 inline-flex size-8 items-center justify-center rounded-md transition-colors"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Selector de salón si hay > 1 */}
        {floorPlans.length > 1 && (
          <div className="border-b border-zinc-200 px-4 py-2 overflow-x-auto">
            <div className="flex gap-1.5">
              {floorPlans.map(({ plan }) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setActivePlanId(plan.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition",
                    activePlanId === plan.id
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                  )}
                >
                  {plan.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body: sidebar mozos + plano */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Mozos sidebar */}
          <aside className="border-b border-zinc-200 md:border-b-0 md:border-r md:w-72 md:flex-shrink-0">
            <div className="p-3">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">
                Mozos
              </p>
              {targetMozos.length === 0 ? (
                <p className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500">
                  No hay mozos cargados. Agregá empleados con rol "mozo" desde
                  /admin/empleados.
                </p>
              ) : (
                <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible">
                  {targetMozos.map((m) => {
                    const isActive = activeMozoId === m.user_id;
                    const color = colorForMozo(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => setActiveMozoId(m.user_id)}
                        className={cn(
                          "flex flex-shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition",
                          isActive
                            ? "bg-zinc-900 text-white shadow"
                            : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
                        )}
                      >
                        <span
                          className="flex size-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: color }}
                        >
                          {initialsFromName(m.full_name ?? "?")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm font-semibold",
                              isActive ? "text-white" : "text-zinc-900",
                            )}
                          >
                            {m.full_name ?? "—"}
                          </p>
                          <p
                            className={cn(
                              "text-[0.65rem] tabular-nums",
                              isActive ? "text-zinc-300" : "text-zinc-500",
                            )}
                          >
                            {countByMozo[m.user_id] ?? 0} mesas
                          </p>
                        </div>
                      </button>
                    );
                  })}
                  {/* Sin asignar */}
                  <button
                    type="button"
                    onClick={() => setActiveMozoId(null)}
                    className={cn(
                      "flex flex-shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition",
                      activeMozoId === null
                        ? "bg-rose-100 text-rose-900 ring-1 ring-rose-300"
                        : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100",
                    )}
                  >
                    <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500">
                      <UserMinus className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        Desasignar
                      </p>
                      <p className="text-[0.65rem] text-zinc-500 tabular-nums">
                        {totalSinAsignar} mesas
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>
            <div className="mx-3 mb-3 hidden md:block rounded-lg bg-zinc-50 p-3 text-[0.7rem] leading-relaxed text-zinc-600">
              Tocá un mozo y después las mesas que le tocan. Tap en una mesa
              ya asignada al mozo activo la desasigna. La asignación queda
              <span className="font-semibold"> fija</span> hasta que la cambies.
            </div>
          </aside>

          {/* Plano */}
          <main className="flex-1 min-h-0 overflow-auto p-3">
            {!activePlan ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Sin salón seleccionado.
              </div>
            ) : (
              <CustomFloorPlanViewer
                plan={activePlan.plan}
                tables={activePlan.tables.filter((t) => t.status === "active")}
                localAssign={localAssign}
                colorForMozo={colorForMozo}
                onTableClick={handleTableClick}
                extras={extras}
              />
            )}
          </main>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Custom viewer con teñido por mozo ─────────────────────────────

import type { FloorPlan } from "@/lib/reservations/types";

function CustomFloorPlanViewer({
  plan,
  tables,
  localAssign,
  colorForMozo,
  onTableClick,
  extras,
}: {
  plan: Pick<
    FloorPlan,
    "width" | "height" | "background_image_url" | "background_opacity"
  >;
  tables: FloorTable[];
  localAssign: Record<string, string | null>;
  colorForMozo: (mozoId: string) => string;
  onTableClick: (table: FloorTable) => void;
  extras: Record<string, TableExtra>;
}) {
  // Para el modo asignación queremos que el teñido por mozo gane sobre el
  // estado operacional. Pasamos al FloorPlanViewer extras + interceptamos
  // el render con un overlay SVG simple que pinta cada mesa con el color.
  // Approach simple: un SVG propio acá en lugar de extender el viewer.
  void extras;

  return (
    <div className="overflow-auto rounded-xl border bg-zinc-50 shadow-inner">
      <svg
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        className="block w-full rounded-lg bg-white"
        style={{ aspectRatio: `${plan.width}/${plan.height}`, maxHeight: "70dvh" }}
      >
        {plan.background_image_url && (
          <image
            href={plan.background_image_url}
            x={0}
            y={0}
            width={plan.width}
            height={plan.height}
            preserveAspectRatio="xMidYMid slice"
            opacity={plan.background_opacity / 100}
          />
        )}
        {tables.map((t) => {
          const mozoId = localAssign[t.id];
          const fill = mozoId ? colorForMozo(mozoId) : "#f4f4f5";
          const stroke = mozoId ? colorForMozo(mozoId) : "#a1a1aa";
          const cx = t.width / 2;
          const cy = t.height / 2;
          const transform = `translate(${t.x} ${t.y}) rotate(${t.rotation} ${cx} ${cy})`;
          const labelSize = Math.min(t.width, t.height) * 0.28;
          return (
            <g
              key={t.id}
              transform={transform}
              onClick={() => onTableClick(t)}
              style={{ cursor: "pointer" }}
            >
              {t.shape === "circle" ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={Math.min(t.width, t.height) / 2}
                  fill={fill}
                  fillOpacity={mozoId ? 0.25 : 1}
                  stroke={stroke}
                  strokeWidth={3}
                />
              ) : (
                <rect
                  x={0}
                  y={0}
                  width={t.width}
                  height={t.height}
                  rx={t.shape === "square" ? 8 : 4}
                  fill={fill}
                  fillOpacity={mozoId ? 0.25 : 1}
                  stroke={stroke}
                  strokeWidth={3}
                />
              )}
              <text
                x={cx}
                y={cy + labelSize / 3}
                textAnchor="middle"
                fontSize={labelSize}
                fontWeight={700}
                fill={mozoId ? stroke : "#52525b"}
              >
                {t.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
