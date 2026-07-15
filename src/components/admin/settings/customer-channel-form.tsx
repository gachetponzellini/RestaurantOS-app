"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateCustomerChannel } from "@/lib/notifications/channel-actions";
import type { CustomerChannel } from "@/lib/notifications/customer-channel";

const OPTIONS: { value: CustomerChannel; label: string; hint: string }[] = [
  {
    value: "whatsapp",
    label: "WhatsApp",
    hint: "Requiere la cuenta conectada y las plantillas aprobadas por Meta.",
  },
  {
    value: "email",
    label: "Email",
    hint: "Usa el email del cliente (login con Google). No depende de Meta.",
  },
  {
    value: "both",
    label: "Ambos",
    hint: "Manda por los dos canales de forma independiente.",
  },
];

export function CustomerChannelForm({
  slug,
  initial,
}: {
  slug: string;
  initial: CustomerChannel;
}) {
  const [channel, setChannel] = useState<CustomerChannel>(initial);
  const [isSaving, startSave] = useTransition();

  const handleSave = () => {
    startSave(async () => {
      const res = await updateCustomerChannel({
        business_slug: slug,
        channel,
      });
      if (res.ok) toast.success("Canal guardado.");
      else toast.error(res.error);
    });
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50"
          >
            <input
              type="radio"
              name="customer-channel"
              value={opt.value}
              checked={channel === opt.value}
              onChange={() => setChannel(opt.value)}
              className="mt-1 size-4"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium text-zinc-900">
                {opt.label}
              </span>
              <span className="text-xs text-zinc-500">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || channel === initial}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isSaving ? "Guardando…" : "Guardar canal"}
        </button>
      </div>
    </div>
  );
}
