"use client";

import { useMemo, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import {
  enviarResumenAhora,
  updateShiftSummaryConfig,
} from "@/lib/reports/shift-summary-actions";

type Initial = {
  enabled: boolean;
  hour: number;
  recipients: string[];
};

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShiftSummaryForm({
  slug,
  initial,
}: {
  slug: string;
  initial: Initial;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [hour, setHour] = useState(initial.hour);
  const [recipientsRaw, setRecipientsRaw] = useState(
    initial.recipients.join("\n"),
  );
  const [isSaving, startSave] = useTransition();
  const [isSending, startSend] = useTransition();

  const recipients = useMemo(
    () => parseRecipients(recipientsRaw),
    [recipientsRaw],
  );
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e));

  const handleSave = () => {
    if (invalid.length > 0) {
      toast.error(`Email inválido: ${invalid[0]}`);
      return;
    }
    startSave(async () => {
      const res = await updateShiftSummaryConfig({
        business_slug: slug,
        enabled,
        hour,
        recipients,
      });
      if (res.ok) toast.success("Configuración guardada.");
      else toast.error(res.error);
    });
  };

  const handleSendNow = () => {
    startSend(async () => {
      const res = await enviarResumenAhora(slug);
      if (res.ok)
        toast.success(
          `Resumen enviado a ${res.data.recipients} destinatario(s).`,
        );
      else toast.error(res.error);
    });
  };

  return (
    <div className="grid gap-5">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4 rounded border-zinc-300"
        />
        <span className="text-sm font-medium text-zinc-900">
          Enviar el resumen automáticamente al cierre del día
        </span>
      </label>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-zinc-500">
          Hora de envío
        </span>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          disabled={!enabled}
          className="w-40 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-40"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-400">
          El cron manda el resumen del día una vez que pasó esta hora (no se
          reenvía solo).
        </span>
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-zinc-500">
          Destinatarios
        </span>
        <textarea
          value={recipientsRaw}
          onChange={(e) => setRecipientsRaw(e.target.value)}
          rows={3}
          placeholder="Un email por línea. Vacío = los admins del negocio."
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
        />
        {invalid.length > 0 && (
          <span className="text-xs text-red-600">
            Email inválido: {invalid.join(", ")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          disabled={isSending}
          onClick={handleSendNow}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-40"
        >
          <Send className="size-4" />
          {isSending ? "Enviando..." : "Enviar resumen ahora"}
        </button>
      </div>
    </div>
  );
}
