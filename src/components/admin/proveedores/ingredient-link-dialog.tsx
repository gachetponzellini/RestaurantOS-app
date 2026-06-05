"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { linkSupplierIngredients } from "@/lib/proveedores/actions";
import type { SupplierIngredientLink } from "@/lib/proveedores/types";

type Props = {
  slug: string;
  supplierId: string;
  businessId: string;
  ingredientOptions: { id: string; name: string; unit: string }[];
  currentLinks: SupplierIngredientLink[];
  onSuccess?: () => void;
};

export function IngredientLinkDialog({
  slug,
  supplierId,
  ingredientOptions,
  currentLinks,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentLinks.map((l) => l.ingredientId)),
  );

  const filtered = search
    ? ingredientOptions.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()),
      )
    : ingredientOptions;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const result = await linkSupplierIngredients(
        slug,
        supplierId,
        Array.from(selected),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Insumos vinculados.");
      setOpen(false);
      router.refresh();
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSelected(new Set(currentLinks.map((l) => l.ingredientId)));
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm"><Link2 className="size-3.5 mr-1.5" />Vincular insumos</Button>} />
      <DialogContent className="max-h-[80vh] max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular insumos al proveedor</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar insumo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">
              Sin resultados.
            </p>
          ) : (
            filtered.map((ing) => (
              <label
                key={ing.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(ing.id)}
                  onChange={() => toggle(ing.id)}
                  className="size-4 rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-900">{ing.name}</span>
                <span className="text-xs text-zinc-400">({ing.unit})</span>
              </label>
            ))
          )}
        </div>

        <p className="text-xs text-zinc-500">
          {selected.size} insumo{selected.size !== 1 ? "s" : ""} seleccionado
          {selected.size !== 1 ? "s" : ""}.
        </p>

        <DialogFooter>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
