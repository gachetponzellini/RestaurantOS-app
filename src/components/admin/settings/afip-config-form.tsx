"use client";

import { useState, useTransition } from "react";
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
import { updateAfipConfig } from "@/lib/afip/config-actions";
import type { AFIPProvider, TipoComprobante } from "@/lib/afip/types";

import { SectionField } from "./settings-section";

type Props = {
  slug: string;
  initial: {
    cuit: string;
    puntoVenta: number;
    provider: AFIPProvider;
    defaultTipo: TipoComprobante;
  };
};

export function AfipConfigForm({ slug, initial }: Props) {
  const [cuit, setCuit] = useState(initial.cuit);
  const [puntoVenta, setPuntoVenta] = useState(String(initial.puntoVenta || ""));
  const [provider, setProvider] = useState<AFIPProvider>(initial.provider);
  const [defaultTipo, setDefaultTipo] = useState<TipoComprobante>(initial.defaultTipo);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateAfipConfig({
        slug,
        cuit,
        puntoVenta: Number(puntoVenta) || 0,
        provider,
        defaultTipo,
      });
      if (result.ok) {
        toast.success("Configuración AFIP guardada.");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="grid gap-5">
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Guardando…" : "Guardar AFIP"}
        </Button>
      </div>
    </div>
  );
}
