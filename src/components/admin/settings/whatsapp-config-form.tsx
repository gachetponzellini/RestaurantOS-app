"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, PlugZap, Send } from "lucide-react";
import { toast } from "sonner";

import { SectionField } from "@/components/admin/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWhatsappStatus,
  sendWhatsappTest,
  setWhatsappCredentials,
} from "@/lib/notifications/actions";

export function WhatsappConfigForm({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [connected, setConnected] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState(""); // write-only; vacío = no cambia
  const [fromPhone, setFromPhone] = useState("");
  const [channelId, setChannelId] = useState("");
  const [testPhone, setTestPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getWhatsappStatus(slug);
      if (!cancelled && res.ok) {
        setConnected(res.data.connected);
        setHasApiKey(res.data.hasApiKey);
        setFromPhone(res.data.fromPhone ?? "");
        setChannelId(res.data.channelId ?? "");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const save = async () => {
    setSaving(true);
    const res = await setWhatsappCredentials({
      businessSlug: slug,
      apiKey: apiKey.trim() || undefined,
      fromPhone: fromPhone.trim(),
      channelId: channelId.trim(),
    });
    setSaving(false);
    if (res.ok) {
      setApiKey("");
      const status = await getWhatsappStatus(slug);
      if (status.ok) {
        setConnected(status.data.connected);
        setHasApiKey(status.data.hasApiKey);
      }
      toast.success("Credenciales guardadas");
    } else {
      toast.error(res.error ?? "No pude guardar");
    }
  };

  const test = async () => {
    if (!testPhone.trim()) {
      toast.error("Ingresá un número para la prueba");
      return;
    }
    setTesting(true);
    const res = await sendWhatsappTest({ businessSlug: slug, toPhone: testPhone });
    setTesting(false);
    if (res.ok) toast.success("Mensaje de prueba enviado");
    else toast.error(res.error ?? "No se pudo enviar la prueba");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2 text-sm">
        {connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <CheckCircle2 className="size-4" /> Conectado a 360dialog
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
            <PlugZap className="size-4" /> No conectado
          </span>
        )}
      </div>

      <SectionField
        label="API key de 360dialog"
        hint={
          hasApiKey
            ? "Ya hay una key cargada. Escribí una nueva sólo si querés reemplazarla."
            : "La key del canal de WhatsApp (D360-API-KEY). No se muestra una vez guardada."
        }
      >
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasApiKey ? "•••••••• (cargada)" : "Pegá la API key"}
        />
      </SectionField>

      <div className="grid gap-5 sm:grid-cols-2">
        <SectionField label="Número de WhatsApp" hint="El número del local (formato +54…).">
          <Input
            value={fromPhone}
            onChange={(e) => setFromPhone(e.target.value)}
            placeholder="+5491122334455"
          />
        </SectionField>
        <SectionField label="Channel ID (opcional)" hint="Identificador del canal en 360dialog.">
          <Input
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="—"
          />
        </SectionField>
      </div>

      <div>
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Guardar credenciales
        </Button>
      </div>

      <div className="border-t border-zinc-200 pt-5">
        <SectionField
          label="Probar el envío"
          hint="Mandá un mensaje de prueba a un número para validar la conexión."
        >
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+5491122334455"
            />
            <Button
              variant="outline"
              onClick={test}
              disabled={testing || !connected}
              className="shrink-0 gap-1.5"
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar
            </Button>
          </div>
        </SectionField>
      </div>
    </div>
  );
}
