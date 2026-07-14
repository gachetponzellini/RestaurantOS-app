"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { importIngredients, type ImportError } from "@/lib/ingredients/actions";

// Filas crudas que se envían a la action (la action las valida con Zod).
type ParsedRow = {
  name: string;
  unit: string;
  presentation_name: string;
  net_quantity: number;
  cost_cents: number;
  waste_percent: number;
  stock_initial: number;
};

// ── Parser CSV liviano (sin dependencias) ────────────────────────

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos
    .replace(/\s+/g, "_");
}

/** Parsea un número con formato AR (1.500,50) o internacional (1500.50). */
function parseNumber(raw: string): number {
  let s = raw.replace(/[^0-9.,-]/g, "").trim();
  if (s.includes(".") && s.includes(",")) {
    // "1.500,50" → miles con punto, decimal con coma
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const COLUMN_ALIASES: Record<string, keyof ParsedRow | "cost_pesos"> = {
  nombre: "name",
  name: "name",
  insumo: "name",
  descripcion: "name",
  unidad: "unit",
  unit: "unit",
  um: "unit",
  presentacion: "presentation_name",
  envase: "presentation_name",
  neto: "net_quantity",
  cantidad: "net_quantity",
  contenido: "net_quantity",
  net: "net_quantity",
  net_quantity: "net_quantity",
  costo: "cost_pesos",
  precio: "cost_pesos",
  cost: "cost_pesos",
  costo_centavos: "cost_cents",
  cost_cents: "cost_cents",
  merma: "waste_percent",
  waste: "waste_percent",
  desperdicio: "waste_percent",
  waste_percent: "waste_percent",
  stock: "stock_initial",
  stock_inicial: "stock_initial",
  existencia: "stock_initial",
};

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const cells = line.split(delimiter);
    const row: ParsedRow = {
      name: "",
      unit: "",
      presentation_name: "Default",
      net_quantity: 0,
      cost_cents: 0,
      waste_percent: 0,
      stock_initial: 0,
    };
    headers.forEach((h, idx) => {
      const field = COLUMN_ALIASES[h];
      const value = (cells[idx] ?? "").trim();
      if (!field || value === "") return;
      if (field === "name") row.name = value;
      else if (field === "unit") row.unit = value.toLowerCase();
      else if (field === "presentation_name") row.presentation_name = value;
      else if (field === "net_quantity") row.net_quantity = parseNumber(value);
      else if (field === "cost_pesos") row.cost_cents = Math.round(parseNumber(value) * 100);
      else if (field === "cost_cents") row.cost_cents = Math.round(parseNumber(value));
      else if (field === "waste_percent") row.waste_percent = parseNumber(value);
      else if (field === "stock_initial") row.stock_initial = parseNumber(value);
    });
    return row;
  });
}

// ── Dialog ───────────────────────────────────────────────────────

export function IngredientImportDialog({ slug }: { slug: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<{ imported: number; errors: ImportError[] } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setRows([]);
    setFileName("");
    setResult(null);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      if (parsed.length === 0) {
        toast.error("No se pudieron leer filas del archivo. ¿Tiene encabezados?");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      setResult(null);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (rows.length === 0) return;
    startTransition(async () => {
      const r = await importIngredients(slug, rows);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult(r.data);
      if (r.data.imported > 0) {
        toast.success(`${r.data.imported} insumo(s) importado(s).`);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" className="gap-2">
            <FileUp className="size-4" />
            Importar CSV
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar insumos desde CSV</DialogTitle>
          <DialogDescription>
            Exportá el Excel de MaxiRest a CSV. Columnas reconocidas:{" "}
            <code>nombre</code>, <code>unidad</code> (kg/lt/un/g/ml),{" "}
            <code>presentacion</code>, <code>neto</code>, <code>costo</code> (en
            pesos), <code>merma</code> (%), <code>stock</code>.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleImport();
          }}
          className="space-y-4"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-8 text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            <Upload className="size-7" strokeWidth={1.5} />
            <span className="text-sm font-medium">
              {fileName || "Elegí un archivo CSV"}
            </span>
            {rows.length > 0 && (
              <span className="text-xs text-emerald-600">
                {rows.length} fila(s) detectada(s)
              </span>
            )}
          </button>

          {result && (
            <div className="space-y-2 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60">
              <p className="text-sm font-semibold text-zinc-900">
                {result.imported} importado(s) · {result.errors.length} con error
              </p>
              {result.errors.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-red-700">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Fila {e.row} ({e.name}): {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={pending}
            >
              Cerrar
            </Button>
            <Button
              type="submit"
              disabled={pending || rows.length === 0}
              className="gap-2"
            >
              <FileUp className="size-4" />
              {pending ? "Importando…" : `Importar ${rows.length || ""}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
