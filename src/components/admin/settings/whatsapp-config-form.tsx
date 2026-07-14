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

type Provider = "360dialog" | "gupshup";

const PROVIDER_LABEL: Record<Provider, string> = {
  "360dialog": "360dialog",
  gupshup: "Gupshup (puente temporal)",
};

export function WhatsappConfigForm({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [businessId, setBusinessId] = useState("");
  const [connected, setConnected] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasWebhookToken, setHasWebhookToken] = useState(false);
  const [provider, setProvider] = useState<Provider>("360dialog");
  const [apiKey, setApiKey] = useState(""); // write-only; vacío = no cambia
  const [fromPhone, setFromPhone] = useState("");
  const [appName, setAppName] = useState("");
  const [webhookToken, setWebhookToken] = useState(""); // write-only
  const [channelId, setChannelId] = useState("");
  const [testPhone, setTestPhone] = useState("");

  const isGupshup = provider === "gupshup";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getWhatsappStatus(slug);
      if (!cancelled && res.ok) {
        setBusinessId(res.data.businessId);
        setConnected(res.data.connected);
        setHasApiKey(res.data.hasApiKey);
        setHasWebhookToken(res.data.hasWebhookToken);
        setProvider(res.data.provider === "gupshup" ? "gupshup" : "360dialog");
        setFromPhone(res.data.fromPhone ?? "");
        setAppName(res.data.appName ?? "");
        setChannelId(res.data.channelId ?? "");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const refreshStatus = async () => {
    const status = await getWhatsappStatus(slug);
    if (status.ok) {
      setConnected(status.data.connected);
      setHasApiKey(status.data.hasApiKey);
      setHasWebhookToken(status.data.hasWebhookToken);
    }
  };

  const save = async () => {
    setSaving(true);
    const res = await setWhatsappCredentials({
      businessSlug: slug,
      provider,
      apiKey: apiKey.trim() || undefined,
      fromPhone: fromPhone.trim(),
      appName: appName.trim(),
      webhookToken: webhookToken.trim() || undefined,
      channelId: channelId.trim(),
    });
    setSaving(false);
    if (res.ok) {
      setApiKey("");
      setWebhookToken("");
      await refreshStatus();
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

  const callbackUrl =
    typeof window !== "undefined" && businessId
      ? `${window.location.origin}/api/chatbot/whatsapp/${businessId}?token=<tu-token>`
      : "";

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2 text-sm">
        {connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <CheckCircle2 className="size-4" /> Conectado a {PROVIDER_LABEL[provider]}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
            <PlugZap className="size-4" /> No conectado
          </span>
        )}
      </div>

      <SectionField
        label="Proveedor"
        hint="Por dónde se envían y reciben los WhatsApp de este local. Gupshup es el puente temporal hasta el gateway propio."
      >
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="gupshup">{PROVIDER_LABEL.gupshup}</option>
          <option value="360dialog">{PROVIDER_LABEL["360dialog"]}</option>
        </select>
      </SectionField>

      <SectionField
        label={isGupshup ? "API key de Gupshup" : "API key de 360dialog"}
        hint={
          hasApiKey
            ? "Ya hay una key cargada. Escribí una nueva sólo si querés reemplazarla."
            : isGupshup
              ? "La API key de la cuenta de Gupshup (header apikey). No se muestra una vez guardada."
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
        <SectionField
          label="Número de WhatsApp"
          hint={
            isGupshup
              ? "El número WABA del local (source), formato +54…."
              : "El número del local (formato +54…)."
          }
        >
          <Input
            value={fromPhone}
            onChange={(e) => setFromPhone(e.target.value)}
            placeholder="+5491122334455"
          />
        </SectionField>
        {isGupshup ? (
          <SectionField
            label="App name (src.name)"
            hint="El nombre de la App registrada en Gupshup contra el número."
          >
            <Input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="MiAppGupshup"
            />
          </SectionField>
        ) : (
          <SectionField label="Channel ID (opcional)" hint="Identificador del canal en 360dialog.">
            <Input
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="—"
            />
          </SectionField>
        )}
      </div>

      {isGupshup ? (
        <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <SectionField
            label="Token del webhook entrante"
            hint={
              hasWebhookToken
                ? "Ya hay un token cargado. Escribí uno nuevo sólo si querés reemplazarlo."
                : "Un secreto que elegís vos (Gupshup no firma sus webhooks). Se usa para autenticar los mensajes entrantes."
            }
          >
            <Input
              type="password"
              autoComplete="off"
              value={webhookToken}
              onChange={(e) => setWebhookToken(e.target.value)}
              placeholder={hasWebhookToken ? "•••••••• (cargado)" : "Elegí un token secreto"}
            />
          </SectionField>
          {callbackUrl ? (
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">Callback URL para Gupshup</span> (pegá tu
              token en lugar de <code>&lt;tu-token&gt;</code>):
              <code className="mt-1 block overflow-x-auto rounded bg-white px-2 py-1.5 text-[11px] text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                {callbackUrl}
              </code>
            </div>
          ) : null}
        </div>
      ) : null}

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
