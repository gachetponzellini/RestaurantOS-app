"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getPrintAgentInstaller,
  rotatePrintAgentKey,
} from "@/lib/print-agent/credentials-actions";

const OFFLINE_THRESHOLD_MS = 60_000;

function relativeTime(fromIso: string, now: number): string {
  const diff = Math.max(0, now - new Date(fromIso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function triggerDownload(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Descarga una URL remota vía <a> (no window.open): el .exe viene por signed URL
 * con Content-Disposition: attachment, así el click descarga sin navegar y sin
 * que el bloqueador de popups lo mate tras el await de la server action.
 */
function triggerUrlDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function PrintAgentCard({
  slug,
  keySet,
  lastSeenAt,
}: {
  slug: string;
  keySet: boolean;
  lastSeenAt: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [downloading, startDownload] = useTransition();
  const [rotating, startRotate] = useTransition();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  // Reloj vivo para que "hace X" y conectado/caído se actualicen solos.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const online =
    lastSeenAt != null && now - new Date(lastSeenAt).getTime() < OFFLINE_THRESHOLD_MS;

  const handleDownload = () => {
    startDownload(async () => {
      const r = await getPrintAgentInstaller(slug);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      triggerDownload("config.json", r.data.configJson, "application/json");
      if (r.data.zipUrl) {
        triggerUrlDownload(r.data.zipUrl);
        toast.success(
          "Descargando instalador. Descomprimí el ZIP, dejá config.json adentro y doble clic en instalar.bat.",
        );
      } else {
        toast.success(
          "Bajé config.json. El instalador todavía no está publicado — usá el que ya tenés en la carpeta.",
        );
      }
    });
  };

  const handleRotate = () => {
    startRotate(async () => {
      const r = await rotatePrintAgentKey(slug);
      setConfirmRotate(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setFreshKey(r.data.key);
      toast.success("Key regenerada. Reinstalá el agente con la nueva.");
    });
  };

  return (
    <div className="grid gap-4">
      {/* Estado del agente (heartbeat, spec 35) */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            online
              ? "inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200/70"
              : "inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700 ring-1 ring-red-200/70"
          }
        >
          <span
            className={
              online
                ? "size-2 rounded-full bg-emerald-500"
                : "size-2 rounded-full bg-red-500"
            }
            aria-hidden
          />
          {online
            ? `Conectado · ${relativeTime(lastSeenAt as string, now)}`
            : lastSeenAt
              ? `Sin conexión · ${relativeTime(lastSeenAt, now)}`
              : "Sin conexión · nunca reportó"}
        </span>
      </div>

      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200/60">
        ⚠️ Instalá el agente en <strong>una sola PC</strong> del local. Correrlo
        en dos duplica los tickets.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleDownload} disabled={downloading}>
          {downloading ? "Preparando…" : "Descargar instalador"}
        </Button>

        {keySet ? (
          confirmRotate ? (
            <span className="inline-flex items-center gap-2 text-sm text-zinc-700">
              ¿Regenerar? El agente actual deja de imprimir hasta reinstalar.
              <Button
                variant="destructive"
                onClick={handleRotate}
                disabled={rotating}
              >
                {rotating ? "Generando…" : "Sí, regenerar"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmRotate(false)}
                disabled={rotating}
              >
                Cancelar
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmRotate(true)}>
              Regenerar key
            </Button>
          )
        ) : null}
      </div>

      <p className="text-xs text-zinc-500">
        Descomprimí el ZIP, dejá el <code>config.json</code> descargado en la
        misma carpeta y doble clic en <code>instalar.bat</code>. Queda corriendo
        y arranca solo al prender la PC.
      </p>

      {freshKey ? (
        <div className="grid gap-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
          <p className="text-xs font-medium text-zinc-700">
            Key nueva (se muestra una sola vez — ya quedó en el config.json que
            vas a descargar):
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs text-zinc-900 ring-1 ring-zinc-200/70">
              {freshKey}
            </code>
            <Button
              variant="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(freshKey);
                toast.success("Key copiada.");
              }}
            >
              Copiar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
