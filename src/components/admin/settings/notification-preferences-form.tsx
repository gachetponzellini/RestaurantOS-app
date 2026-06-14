"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  listNotificationPreferences,
  setNotificationPreference,
} from "@/lib/notifications/actions";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_TARGET_ROLES,
  type NotificationChannel,
} from "@/lib/notifications/preferences";

const ROLE_LABELS: Record<string, string> = {
  admin: "Dueño / Admin",
  encargado: "Encargado",
  mozo: "Mozo",
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "En la app",
  whatsapp: "WhatsApp",
};

const key = (event: string, role: string, channel: string) =>
  `${event}|${role}|${channel}`;

/** Default efectivo sin preferencia explícita: in_app on, whatsapp off. */
function defaultEnabled(channel: NotificationChannel): boolean {
  return channel === "in_app";
}

export function NotificationPreferencesForm({ slug }: { slug: string }) {
  const [state, setState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Base: defaults para toda la matriz.
      const base: Record<string, boolean> = {};
      for (const ev of NOTIFICATION_EVENTS) {
        for (const role of NOTIFICATION_TARGET_ROLES) {
          for (const ch of NOTIFICATION_CHANNELS) {
            base[key(ev.type, role, ch)] = defaultEnabled(ch);
          }
        }
      }
      const res = await listNotificationPreferences(slug);
      if (!cancelled && res.ok) {
        for (const p of res.data) {
          if (p.target_role) {
            base[key(p.event_type, p.target_role, p.channel)] = p.enabled;
          }
        }
      }
      if (!cancelled) {
        setState(base);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const toggle = async (
    event: string,
    role: string,
    channel: NotificationChannel,
  ) => {
    const k = key(event, role, channel);
    const next = !state[k];
    setPending(k);
    setState((s) => ({ ...s, [k]: next })); // optimista
    const res = await setNotificationPreference({
      businessSlug: slug,
      eventType: event,
      targetRole: role,
      channel,
      enabled: next,
    });
    setPending(null);
    if (!res.ok) {
      setState((s) => ({ ...s, [k]: !next })); // revertir
      toast.error(res.error ?? "No pude guardar la preferencia");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin" /> Cargando preferencias…
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <p className="text-xs text-zinc-500">
        Elegí quién recibe cada aviso y por qué canal. WhatsApp al personal queda
        encolado hasta conectar la cuenta de Meta del local.
      </p>
      {NOTIFICATION_EVENTS.map((ev) => (
        <div key={ev.type} className="rounded-xl border border-zinc-200 p-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900">{ev.label}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-1 pr-4 font-medium">Destinatario</th>
                  {NOTIFICATION_CHANNELS.map((ch) => (
                    <th key={ch} className="px-3 py-1 text-center font-medium">
                      {CHANNEL_LABELS[ch]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_TARGET_ROLES.map((role) => (
                  <tr key={role} className="border-t border-zinc-100">
                    <td className="py-1.5 pr-4 text-zinc-700">
                      {ROLE_LABELS[role]}
                    </td>
                    {NOTIFICATION_CHANNELS.map((ch) => {
                      const k = key(ev.type, role, ch);
                      return (
                        <td key={ch} className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={Boolean(state[k])}
                            disabled={pending === k}
                            onChange={() => toggle(ev.type, role, ch)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
