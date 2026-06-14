"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FlaskConical, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  promoteAfipToProduction,
  revertAfipToSandbox,
  updateAfipConfig,
} from "@/lib/afip/config-actions";
import type { AFIPProvider, FiscalMode, TipoComprobante } from "@/lib/afip/types";
import { cn } from "@/lib/utils";

import { SectionField } from "./settings-section";

type Props = {
  slug: string;
  initial: {
    cuit: string;
    puntoVenta: number;
    provider: AFIPProvider;
    defaultTipo: TipoComprobante;
    mode: FiscalMode;
    enabled: boolean;
    hasApiToken: boolean;
    hasApiKey: boolean;
    hasUserToken: boolean;
  };
};

export function AfipConfigForm({ slug, initial }: Props) {
  const router = useRouter();
  const [cuit, setCuit] = useState(initial.cuit);
  const [puntoVenta, setPuntoVenta] = useState(String(initial.puntoVenta || ""));
  const [provider, setProvider] = useState<AFIPProvider>(initial.provider);
  const [defaultTipo, setDefaultTipo] = useState<TipoComprobante>(
    initial.defaultTipo,
  );
  // Tokens: nunca se pre-rellenan. Vacío = "no tocar lo ya guardado".
  const [apiToken, setApiToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [userToken, setUserToken] = useState("");
  const [pending, startTransition] = useTransition();
  const [promoting, startPromote] = useTransition();

  const isProduction = initial.mode === "produccion" && initial.enabled;
  // Credenciales cargadas: las tres ya guardadas, o las tres recién tipeadas.
  const credsLoaded =
    (initial.hasApiToken || apiToken.trim().length > 0) &&
    (initial.hasApiKey || apiKey.trim().length > 0) &&
    (initial.hasUserToken || userToken.trim().length > 0);

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateAfipConfig({
        slug,
        cuit,
        puntoVenta: Number(puntoVenta) || 0,
        provider,
        defaultTipo,
        apiToken: apiToken || undefined,
        apiKey: apiKey || undefined,
        userToken: userToken || undefined,
      });
      if (result.ok) {
        toast.success("Configuración AFIP guardada.");
        setApiToken("");
        setApiKey("");
        setUserToken("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handlePromote = () => {
    startPromote(async () => {
      const result = await promoteAfipToProduction(slug);
      if (result.ok) {
        toast.success("Negocio en producción: emisión fiscal real activada.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRevert = () => {
    startPromote(async () => {
      const result = await revertAfipToSandbox(slug);
      if (result.ok) {
        toast.success("Negocio vuelto a sandbox.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="grid gap-6">
      {/* ── Estado de conexión ARCA ──────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between",
          isProduction
            ? "bg-emerald-50 ring-emerald-200/60"
            : "bg-amber-50 ring-amber-200/60",
        )}
      >
        <div className="flex items-center gap-3">
          {isProduction ? (
            <ShieldCheck className="size-5 text-emerald-600" />
          ) : (
            <FlaskConical className="size-5 text-amber-600" />
          )}
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {isProduction
                ? "Producción — emisión fiscal real"
                : "Sandbox — comprobantes de prueba (sin valor fiscal)"}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-600">
              {credsLoaded ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  Credenciales cargadas
                </>
              ) : (
                <>
                  <XCircle className="size-3.5 text-zinc-400" />
                  Sin credenciales reales
                </>
              )}
            </p>
          </div>
        </div>

        {isProduction ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevert}
            disabled={promoting}
          >
            Volver a sandbox
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handlePromote}
            disabled={promoting || !credsLoaded}
            title={
              credsLoaded
                ? undefined
                : "Cargá las credenciales reales antes de promover"
            }
          >
            Pasar a producción
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SectionField label="CUIT" hint="11 dígitos, sin guiones.">
          <Input
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            placeholder="20123456789"
            maxLength={13}
          />
        </SectionField>
        <SectionField label="Punto de venta">
          <Input
            type="number"
            value={puntoVenta}
            onChange={(e) => setPuntoVenta(e.target.value)}
            placeholder="1"
            min={1}
            max={99999}
          />
        </SectionField>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SectionField label="Proveedor de facturación">
          <Select value={provider} onValueChange={(v) => setProvider(v as AFIPProvider)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (pruebas)</SelectItem>
              <SelectItem value="tusfacturas">TusFacturas.app</SelectItem>
              <SelectItem value="afipsdk">AFIP SDK</SelectItem>
              <SelectItem value="direct">Directo AFIP</SelectItem>
            </SelectContent>
          </Select>
        </SectionField>
        <SectionField label="Tipo de comprobante por defecto">
          <Select value={defaultTipo} onValueChange={(v) => setDefaultTipo(v as TipoComprobante)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="factura_b">Factura B</SelectItem>
              <SelectItem value="factura_a">Factura A</SelectItem>
              <SelectItem value="nota_credito_b">Nota de Crédito B</SelectItem>
              <SelectItem value="nota_credito_a">Nota de Crédito A</SelectItem>
            </SelectContent>
          </Select>
        </SectionField>
      </div>

      {/* ── Credenciales de TusFacturas (server-only) ────────────── */}
      <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60">
        <p className="text-sm font-semibold text-zinc-900">
          Credenciales de TusFacturas
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Los tres tokens de tu cuenta de TusFacturas. Se guardan de forma segura
          y no se vuelven a mostrar. Dejá un campo vacío para no modificar el valor
          ya cargado. El certificado de ARCA se carga en el panel de TusFacturas.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SectionField label="API Token">
            <Input
              type="password"
              autoComplete="off"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={initial.hasApiToken ? "•••••••• (cargado)" : "apitoken"}
            />
          </SectionField>
          <SectionField label="API Key">
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={initial.hasApiKey ? "•••••••• (cargado)" : "apikey"}
            />
          </SectionField>
          <SectionField label="User Token">
            <Input
              type="password"
              autoComplete="off"
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              placeholder={
                initial.hasUserToken ? "•••••••• (cargado)" : "usertoken"
              }
            />
          </SectionField>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Guardando…" : "Guardar AFIP"}
        </Button>
      </div>
    </div>
  );
}
