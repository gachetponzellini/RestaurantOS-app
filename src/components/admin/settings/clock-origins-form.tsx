"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addClockOrigin,
  removeClockOrigin,
  type ClockOrigin,
} from "@/lib/rrhh/clock-origin-actions";

import { SectionField } from "./settings-section";

type Props = {
  slug: string;
  origins: ClockOrigin[];
};

export function ClockOriginsForm({ slug, origins }: Props) {
  const router = useRouter();
  const [cidr, setCidr] = useState("");
  const [label, setLabel] = useState("");
  const [adding, startAdd] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [, startRemove] = useTransition();

  const enforcementOn = origins.length > 0;

  const handleAdd = () => {
    if (!cidr.trim()) return;
    startAdd(async () => {
      const r = await addClockOrigin({ slug, cidr, label: label || undefined });
      if (r.ok) {
        toast.success("Origen agregado.");
        setCidr("");
        setLabel("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  const handleRemove = (id: string) => {
    setRemovingId(id);
    startRemove(async () => {
      const r = await removeClockOrigin({ slug, id });
      if (r.ok) {
        toast.success("Origen eliminado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
      setRemovingId(null);
    });
  };

  return (
    <div className="grid gap-5">
      {/* Estado del enforcement */}
      <div
        className={
          enforcementOn
            ? "rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200/60"
            : "rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200/60"
        }
      >
        {enforcementOn
          ? "El fichaje está restringido: sólo se puede fichar desde los orígenes de esta lista."
          : "Sin orígenes configurados: por ahora se puede fichar desde cualquier dispositivo. Agregá el rango de la red del local para restringirlo."}
      </div>

      {/* Lista de orígenes */}
      {origins.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200/60">
          {origins.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-zinc-900">
                  {o.cidr}
                </p>
                {o.label && (
                  <p className="truncate text-xs text-zinc-500">{o.label}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(o.id)}
                disabled={removingId === o.id}
                aria-label={`Eliminar ${o.cidr}`}
              >
                <Trash2 className="size-4 text-red-500" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Alta */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SectionField label="IP o rango (CIDR)" hint="Ej: 192.168.10.0/24 o 192.168.10.42">
          <Input
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            placeholder="192.168.10.0/24"
          />
        </SectionField>
        <SectionField label="Etiqueta (opcional)">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Caja principal"
          />
        </SectionField>
        <Button onClick={handleAdd} disabled={adding || !cidr.trim()}>
          {adding ? "Agregando…" : "Agregar"}
        </Button>
      </div>
    </div>
  );
}
