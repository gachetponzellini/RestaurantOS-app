"use client";

import { useState } from "react";
import Link from "next/link";
import { ChefHat, GlassWater, Package, Settings, TrendingDown, Wine } from "lucide-react";

import { MermaTab } from "@/components/admin/stock/merma-tab";
import { StockBarTab, type BarStockCandidate } from "@/components/admin/stock/stock-bar-tab";
import { StockCocinaTab } from "@/components/admin/stock/stock-cocina-tab";
import { StockGrid } from "@/components/admin/stock/stock-grid";
import type { KitchenStockFull } from "@/lib/ingredients/queries";
import type { MermaReportItem } from "@/lib/ingredients/merma";
import type { StockOverviewItem } from "@/lib/stock/queries";
import { cn } from "@/lib/utils";

type StockView = "bebidas" | "cocina" | "bar" | "merma";

export function StockTab({
  slug,
  bebidas,
  cocina,
  bar,
  barCandidates,
  costByProduct,
  merma,
  mermaFrom,
  mermaTo,
}: {
  slug: string;
  bebidas: StockOverviewItem[];
  cocina: KitchenStockFull[];
  bar: StockOverviewItem[];
  barCandidates: BarStockCandidate[];
  costByProduct: Record<string, number>;
  merma: MermaReportItem[];
  mermaFrom: string;
  mermaTo: string;
}) {
  const [view, setView] = useState<StockView>("bebidas");

  return (
    <div className="space-y-4">
      {/* Toggle bebidas / cocina / bar / merma + acción configurar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-xl bg-white p-1 ring-1 ring-zinc-200/70">
          <ToggleButton
            active={view === "bebidas"}
            onClick={() => setView("bebidas")}
            icon={<Wine className="size-4" />}
            count={bebidas.length}
          >
            Bebidas
          </ToggleButton>
          <ToggleButton
            active={view === "cocina"}
            onClick={() => setView("cocina")}
            icon={<ChefHat className="size-4" />}
            count={cocina.length}
          >
            Cocina
          </ToggleButton>
          <ToggleButton
            active={view === "bar"}
            onClick={() => setView("bar")}
            icon={<GlassWater className="size-4" />}
            count={bar.length}
          >
            Bar
          </ToggleButton>
          <ToggleButton
            active={view === "merma"}
            onClick={() => setView("merma")}
            icon={<TrendingDown className="size-4" />}
          >
            Merma
          </ToggleButton>
        </div>

        {view === "bebidas" && (
          <Link
            href={`/${slug}/admin/stock/configurar`}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            <Settings className="size-4" />
            Configurar productos
          </Link>
        )}
      </div>

      {view === "bebidas" &&
        (bebidas.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-16">
            <Package className="size-10 text-zinc-400" strokeWidth={1.5} />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-700">
                No hay productos con stock trackeado
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Activá el tracking desde{" "}
                <Link
                  href={`/${slug}/admin/stock/configurar`}
                  className="font-medium underline underline-offset-2"
                >
                  Configurar productos
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <StockGrid items={bebidas} slug={slug} />
        ))}

      {view === "cocina" && <StockCocinaTab slug={slug} items={cocina} />}

      {view === "bar" && (
        <StockBarTab
          slug={slug}
          items={bar}
          candidates={barCandidates}
          costByProduct={costByProduct}
        />
      )}

      {view === "merma" && (
        <MermaTab
          slug={slug}
          initialReport={merma}
          initialFrom={mermaFrom}
          initialTo={mermaTo}
        />
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
        active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900",
      )}
    >
      <span className={active ? "text-white" : "text-zinc-400"}>{icon}</span>
      {children}
      {count != null && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums",
            active ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-500",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
