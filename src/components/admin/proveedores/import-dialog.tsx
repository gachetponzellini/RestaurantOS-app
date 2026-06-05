"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { importSuppliers } from "@/lib/proveedores/actions";
import { ImportSupplierBatch } from "@/lib/proveedores/schema";

type Props = {
  slug: string;
};

function parseCSV(text: string) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());

  const nameIdx = headers.findIndex((h) => h === "nombre" || h === "name" || h === "razon social" || h === "razón social");
  const cuitIdx = headers.findIndex((h) => h === "cuit");
  const contactIdx = headers.findIndex((h) => h === "contacto" || h === "contact");
  const phoneIdx = headers.findIndex((h) => h === "telefono" || h === "teléfono" || h === "phone" || h === "móvil" || h === "movil");
  const emailIdx = headers.findIndex((h) => h === "email" || h === "e-mail" || h === "mail");

  return lines.slice(1).map((line) => {
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    return {
      name: nameIdx >= 0 ? cols[nameIdx] ?? "" : "",
      cuit: cuitIdx >= 0 ? cols[cuitIdx] : undefined,
      contact: contactIdx >= 0 ? cols[contactIdx] : undefined,
      phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
      email: emailIdx >= 0 ? cols[emailIdx] : undefined,
    };
  }).filter((r) => r.name);
}

export function ImportDialog({ slug }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseCSV>>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleParse = () => {
    const rows = parseCSV(csv);
    if (rows.length === 0) {
      setValidationError("No se encontraron filas válidas. Verificá que la primera fila sea el encabezado con 'nombre' o 'name'.");
      setPreview([]);
      return;
    }
    const result = ImportSupplierBatch.safeParse(rows);
    if (!result.success) {
      setValidationError(result.error.issues.map((i) => i.message).join(", "));
      setPreview([]);
      return;
    }
    setValidationError(null);
    setPreview(rows);
  };

  const handleImport = async () => {
    setSubmitting(true);
    try {
      const result = await importSuppliers(slug, preview);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { created, updated, errors } = result.data;
      toast.success(`Importados: ${created} nuevos, ${updated} actualizados${errors > 0 ? `, ${errors} con error` : ""}.`);
      setOpen(false);
      setCsv("");
      setPreview([]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCsv(""); setPreview([]); setValidationError(null); } }}>
      <DialogTrigger render={<Button variant="outline" size="sm"><Upload className="size-3.5 mr-1.5" />Importar</Button>} />
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar proveedores desde CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Pegá el contenido CSV con encabezados: nombre, cuit, contacto, telefono, email.
            Separador: coma, punto y coma o tab.
          </p>
          <Textarea
            placeholder={"nombre,cuit,contacto,telefono,email\nDistribuidora del Sur,30-12345678-8,Juan,11-5555-0000,info@dist.com"}
            rows={6}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleParse}
            disabled={!csv.trim()}
          >
            Previsualizar
          </Button>

          {validationError && (
            <p className="text-sm text-red-600">{validationError}</p>
          )}

          {preview.length > 0 && (
            <div className="rounded-lg border">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">CUIT</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Contacto</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Teléfono</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-zinc-900">{row.name}</td>
                        <td className="px-3 py-1.5 text-zinc-600">{row.cuit ?? "—"}</td>
                        <td className="px-3 py-1.5 text-zinc-600">{row.contact ?? "—"}</td>
                        <td className="px-3 py-1.5 text-zinc-600">{row.phone ?? "—"}</td>
                        <td className="px-3 py-1.5 text-zinc-600">{row.email ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                {preview.length} fila{preview.length !== 1 ? "s" : ""} a importar.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleImport}
            disabled={submitting || preview.length === 0}
          >
            {submitting ? "Importando…" : `Importar ${preview.length} proveedor${preview.length !== 1 ? "es" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
