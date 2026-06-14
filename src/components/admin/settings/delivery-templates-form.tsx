"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listDeliveryTemplates,
  setDeliveryTemplate,
} from "@/lib/notifications/actions";
import {
  DEFAULT_DELIVERY_TEMPLATES,
  DELIVERY_NOTIFY_STATUSES,
  DELIVERY_STATUS_LABELS,
  type DeliveryNotifyStatus,
} from "@/lib/notifications/delivery-templates";

type Row = {
  body: string;
  enabled: boolean;
  templateName: string;
  saving: boolean;
};

const PLACEHOLDERS = ["{cliente}", "{numero}", "{negocio}", "{hora}"];

export function DeliveryTemplatesForm({ slug }: { slug: string }) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      DELIVERY_NOTIFY_STATUSES.map((s) => [
        s,
        {
          body: DEFAULT_DELIVERY_TEMPLATES[s],
          enabled: true,
          templateName: "",
          saving: false,
        },
      ]),
    ),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listDeliveryTemplates(slug);
      if (!cancelled && res.ok) {
        setRows((prev) => {
          const next = { ...prev };
          for (const t of res.data) {
            if (next[t.status]) {
              next[t.status] = {
                body: t.body,
                enabled: t.enabled,
                templateName: t.template_name ?? "",
                saving: false,
              };
            }
          }
          return next;
        });
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const patch = (status: string, partial: Partial<Row>) =>
    setRows((p) => ({ ...p, [status]: { ...p[status], ...partial } }));

  const save = async (status: DeliveryNotifyStatus) => {
    const row = rows[status];
    if (!row || !row.body.trim()) {
      toast.error("El mensaje no puede estar vacío.");
      return;
    }
    patch(status, { saving: true });
    const res = await setDeliveryTemplate({
      businessSlug: slug,
      status,
      body: row.body,
      enabled: row.enabled,
      templateName: row.templateName.trim() || undefined,
    });
    patch(status, { saving: false });
    if (res.ok) toast.success(`Plantilla "${DELIVERY_STATUS_LABELS[status]}" guardada`);
    else toast.error(res.error ?? "No pude guardar la plantilla");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin" /> Cargando plantillas…
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <p className="text-xs text-zinc-500">
        Variables disponibles:{" "}
        {PLACEHOLDERS.map((p) => (
          <code
            key={p}
            className="mr-1 rounded bg-zinc-100 px-1 py-0.5 text-[0.7rem]"
          >
            {p}
          </code>
        ))}
      </p>

      {DELIVERY_NOTIFY_STATUSES.map((status) => {
        const row = rows[status];
        return (
          <div
            key={status}
            className="grid gap-2 rounded-xl border border-zinc-200 p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">
                {DELIVERY_STATUS_LABELS[status]}
              </h3>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => patch(status, { enabled: e.target.checked })}
                  className="size-3.5"
                />
                Enviar este aviso
              </label>
            </div>
            <Textarea
              value={row.body}
              onChange={(e) => patch(status, { body: e.target.value })}
              rows={2}
              className="text-sm"
            />
            <Input
              value={row.templateName}
              onChange={(e) => patch(status, { templateName: e.target.value })}
              placeholder="Nombre del template aprobado en Meta (ej: delivery_preparing)"
              className="text-xs"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => save(status)}
                disabled={row.saving}
              >
                {row.saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        );
      })}
      {/* on_the_way sólo se envía en pedidos de delivery (no en take-away). */}
      <p className="text-xs text-zinc-400">
        El aviso «En camino» se envía sólo en pedidos de delivery; en retiro por
        el local se omite automáticamente.
      </p>
      <p className="text-xs text-zinc-400">
        Para que el aviso salga por WhatsApp fuera de la ventana de 24&nbsp;h,
        cargá el nombre de un <strong>template aprobado en Meta</strong>. Sus
        parámetros son posicionales: <code>{"{{1}}"}</code> = cliente,{" "}
        <code>{"{{2}}"}</code> = número de pedido.
      </p>
    </div>
  );
}
