import type { LucideIcon } from "lucide-react";

/**
 * Botones secundarios del panel de mesa (mozo + salón admin), unificados.
 *
 * Tile compacto (ícono arriba, label abajo) + fila adaptativa: las acciones
 * secundarias entran en UNA sola fila que reparte el ancho parejo según cuántas
 * haya (1, 2 o 3), sin dejar un botón huérfano a media columna. Más compacto que
 * el grid 2-col anterior y consistente entre las dos superficies.
 */

export type MesaActionTone =
  | "emerald"
  | "sky"
  | "violet"
  | "zinc"
  | "amber"
  | "rose";

const TONE_CLASS: Record<MesaActionTone, string> = {
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100",
  sky: "bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100",
  violet: "bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200 hover:bg-zinc-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100",
};

export function MesaActionTile({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  tone: MesaActionTone;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold leading-none ring-1 transition active:scale-[0.97] disabled:opacity-60 ${TONE_CLASS[tone]}`}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

/**
 * Fila adaptativa: reparte el ancho entre 1–3 tiles (nunca huérfano). Con más de
 * 3 hace wrap. Devuelve null si no hay acciones.
 */
export function MesaActionRow({ items }: { items: React.ReactNode[] }) {
  const tiles = items.filter(Boolean);
  if (tiles.length === 0) return null;
  const cols = Math.min(tiles.length, 3);
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {tiles}
    </div>
  );
}
