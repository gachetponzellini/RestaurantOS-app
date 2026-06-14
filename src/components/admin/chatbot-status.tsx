"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PowerOff } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfigState = {
  chatbotReady: boolean;
  notReadyReason: "missing_api_key" | "disabled" | null;
  chatbotEnabled: boolean;
  hasApiKey: boolean;
};

/**
 * Estado de configuración del bot: badge "Listo / Falta configurar la API key /
 * Desactivado" + toggle para prender/apagar. Nunca muestra el valor de la key,
 * sólo si está presente (`hasApiKey`). Consume el GET/PUT de /api/chatbot/config.
 */
export function ChatbotStatusBadge({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const [state, setState] = useState<ConfigState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/chatbot/config?businessSlug=${encodeURIComponent(businessSlug)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setState({
        chatbotReady: Boolean(data.chatbotReady),
        notReadyReason: data.notReadyReason ?? null,
        chatbotEnabled: Boolean(data.chatbotEnabled),
        hasApiKey: Boolean(data.hasApiKey),
      });
    } catch {
      // best-effort: si falla, no mostramos el badge.
    }
  }, [businessSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (!state || saving) return;
    setSaving(true);
    const next = !state.chatbotEnabled;
    try {
      const res = await fetch("/api/chatbot/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, chatbotEnabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      toast.success(next ? "Chatbot activado" : "Chatbot desactivado");
    } catch {
      toast.error("No pude cambiar el estado del chatbot");
    } finally {
      setSaving(false);
    }
  };

  if (!state) return null;

  const ready = state.chatbotReady;
  const reason = state.notReadyReason;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ready ? (
        <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="size-3" />
          Listo para responder
        </Badge>
      ) : reason === "missing_api_key" ? (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3" />
          Falta configurar la API key
        </Badge>
      ) : (
        <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
          <PowerOff className="size-3" />
          Desactivado
        </Badge>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-7"
        onClick={toggle}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state.chatbotEnabled ? (
          "Desactivar"
        ) : (
          "Activar"
        )}
      </Button>

      {reason === "missing_api_key" ? (
        <span className={cn("text-xs text-zinc-500")}>
          Cargá <code className="rounded bg-zinc-100 px-1">ANTHROPIC_API_KEY</code>{" "}
          en el servidor del local.
        </span>
      ) : null}
    </div>
  );
}
