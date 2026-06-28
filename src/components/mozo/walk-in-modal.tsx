"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { sentarWalkIn } from "@/lib/mozo/walk-in";

const FormSchema = z.object({
  partySize: z.number().int().min(1).max(20),
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type FormInput = z.input<typeof FormSchema>;

type Props = {
  tableId: string;
  tableLabel: string;
  businessSlug: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function WalkInModal({
  tableId,
  tableLabel,
  businessSlug,
  onClose,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormInput>({
    resolver: zodResolver(FormSchema),
    defaultValues: { partySize: 2, name: "", phone: "", notes: "" },
  });

  const partySize = watch("partySize");

  const onSubmit = async (values: FormInput) => {
    setSubmitting(true);
    const result = await sentarWalkIn({
      tableId,
      partySize: values.partySize,
      name: values.name?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
      slug: businessSlug,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Mesa abierta.");
    onSuccess();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold leading-tight">
              Walk-in · {tableLabel}
            </h3>
            <p className="mt-0.5 text-sm text-zinc-500">
              Solo la cantidad es obligatoria. Si dejás teléfono, entra al CRM.
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

        <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {/* Party size: quick-pick directo + stepper */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Personas
            </label>
            {/* Toque directo a las cantidades más comunes */}
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} personas`}
                  aria-pressed={partySize === n}
                  onClick={() => setValue("partySize", n)}
                  className={`flex h-12 items-center justify-center rounded-xl text-lg font-extrabold tabular-nums transition active:scale-95 ${
                    partySize === n
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {/* Stepper para ajustar o más de 6 */}
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 transition active:scale-95 disabled:opacity-30"
                disabled={partySize <= 1}
                aria-label="Disminuir"
                onClick={() =>
                  setValue("partySize", Math.max(1, partySize - 1))
                }
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="font-heading text-3xl font-extrabold tabular-nums text-zinc-900">
                {partySize}
              </span>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 transition active:scale-95 disabled:opacity-30"
                disabled={partySize >= 20}
                aria-label="Aumentar"
                onClick={() =>
                  setValue("partySize", Math.min(20, partySize + 1))
                }
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            {errors.partySize && (
              <p className="mt-1 text-xs text-red-600">
                {errors.partySize.message}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Nombre (opcional)
            </label>
            <input
              {...register("name")}
              className="mt-1 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base"
              placeholder="Ej: Pedro"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Teléfono (opcional · entra al CRM)
            </label>
            <input
              {...register("phone")}
              className="mt-1 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base"
              placeholder="+54 9 …"
              inputMode="tel"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Notas (opcional)
            </label>
            <textarea
              {...register("notes")}
              rows={2}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base"
              placeholder="Ej: alérgico a maní, cumpleaños…"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Abriendo…" : "Abrir mesa"}
          </button>
        </form>
      </div>
    </div>
  );
}
