"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { fetchAvailability } from "@/lib/reservations/availability-actions";
import { createReservationFromAdmin } from "@/lib/reservations/booking-actions";
import type { FloorTable } from "@/lib/reservations/types";

type Slot = { slot: string; starts_at: string; ends_at: string };

type Props = {
  slug: string;
  tables: FloorTable[];
  floorPlanId: string | null;
  onClose: () => void;
};

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function maxDateISO(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function NewReservationModal({
  slug,
  tables,
  floorPlanId,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(todayISO());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");

  // Slots
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Fetch slots when date or partySize changes.
  useEffect(() => {
    if (!date || partySize < 1) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    fetchAvailability({
      business_slug: slug,
      date,
      party_size: partySize,
      ...(floorPlanId ? { floor_plan_id: floorPlanId } : {}),
    }).then((r) => {
      setLoadingSlots(false);
      if (r.ok) {
        setSlots(r.data);
      } else {
        setSlots([]);
      }
    });
  }, [slug, date, partySize, floorPlanId]);

  const canSubmit =
    name.trim().length > 0 &&
    phone.trim().length >= 4 &&
    selectedSlot !== null &&
    !pending;

  const handleSubmit = () => {
    if (!canSubmit || !selectedSlot) return;
    startTransition(async () => {
      const result = await createReservationFromAdmin({
        business_slug: slug,
        date,
        slot: selectedSlot,
        party_size: partySize,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        notes: notes.trim() || undefined,
        ...(floorPlanId ? { floor_plan_id: floorPlanId } : {}),
        ...(tableId ? { table_id: tableId } : {}),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Reserva creada.");
      router.refresh();
      onClose();
    });
  };

  // Only libre tables.
  const freeTables = tables.filter(
    (t) => t.status === "active" && (t.operational_status ?? "libre") === "libre",
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-0">
          <div className="min-w-0">
            <h3 className="font-heading flex items-center gap-2 text-lg font-bold leading-tight">
              <CalendarPlus className="h-5 w-5 text-blue-600" />
              Nueva reserva
            </h3>
            <p className="mt-0.5 text-sm text-zinc-500">
              Crea una reserva manual desde el admin.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-full p-2 text-zinc-500 transition active:scale-95 active:bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Name */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Nombre *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Ej: Pedro García"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Teléfono *
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="+54 9 …"
              inputMode="tel"
            />
          </div>

          {/* Party size stepper */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Personas
            </label>
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 transition active:scale-95 disabled:opacity-30"
                disabled={partySize <= 1}
                onClick={() => setPartySize((v) => Math.max(1, v - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="font-heading text-2xl font-extrabold tabular-nums text-zinc-900">
                {partySize}
              </span>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 transition active:scale-95 disabled:opacity-30"
                disabled={partySize >= 20}
                onClick={() => setPartySize((v) => Math.min(20, v + 1))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Fecha
            </label>
            <input
              type="date"
              value={date}
              min={todayISO()}
              max={maxDateISO(60)}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Slot grid */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Horario
            </label>
            {loadingSlots ? (
              <div className="mt-2 flex items-center justify-center py-6 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : slots.length === 0 ? (
              <p className="mt-2 text-center text-sm text-zinc-400">
                Sin horarios disponibles para esta fecha.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {slots.map((s) => (
                  <button
                    key={s.slot}
                    type="button"
                    onClick={() => setSelectedSlot(s.slot)}
                    className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition active:scale-95 ${
                      selectedSlot === s.slot
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    {s.slot}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table (optional) */}
          {freeTables.length > 0 && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Mesa (opcional)
              </label>
              <select
                value={tableId ?? ""}
                onChange={(e) =>
                  setTableId(e.target.value || undefined)
                }
                className="mt-1 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Auto-asignar</option>
                {freeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.seats} sillas)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Ej: cumpleaños, alérgico a maní…"
            />
          </div>
        </div>

        {/* Footer — submit button */}
        <div className="border-t border-zinc-200 p-5 pt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Creando…
              </>
            ) : (
              <>
                <CalendarPlus className="h-5 w-5" />
                Crear reserva
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
