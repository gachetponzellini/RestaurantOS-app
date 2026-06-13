"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { AdminStation } from "@/lib/admin/catalog-query";
import {
  createStation,
  deleteStation,
  updateStation,
} from "@/lib/catalog/station-actions";
import { StationInput } from "@/lib/catalog/schemas";

export function StationDialog({
  slug,
  station,
  trigger,
  defaultSortOrder = 0,
}: {
  slug: string;
  station?: AdminStation;
  trigger: React.ReactElement;
  defaultSortOrder?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<StationInput>({
    resolver: zodResolver(StationInput),
    defaultValues: station
      ? {
          name: station.name,
          sort_order: station.sort_order,
          is_active: station.is_active,
        }
      : {
          name: "",
          sort_order: defaultSortOrder,
          is_active: true,
        },
  });

  const isActive = form.watch("is_active");

  const onSubmit = async (values: StationInput) => {
    setSubmitting(true);
    try {
      const result = station
        ? await updateStation(slug, station.id, values)
        : await createStation(slug, values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(station ? "Actualizado." : "Creado.");
      setOpen(false);
      form.reset(values);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!station) return;
    setSubmitting(true);
    try {
      const result = await deleteStation(slug, station.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Sector borrado.");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {station ? "Editar sector de cocina" : "Nuevo sector de cocina"}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-zinc-500">
          Cada sector recibe sus propias comandas. Típicos: Cocina, Parrilla,
          Fritera, Postres, Barra. Una impresora por sector en piloto.
        </p>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4"
            id="station-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder="ej: Parrilla" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* is_active toggle */}
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                    <div>
                      <FormLabel className="cursor-pointer">Activo</FormLabel>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Si lo desactivás, no se podrán rutear nuevas comandas
                        a este sector. Útil para sectores que rotan por turno
                        sin perder el histórico.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => field.onChange(!field.value)}
                      role="switch"
                      aria-checked={isActive}
                      className={`relative ml-3 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                        isActive ? "bg-emerald-600" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          isActive ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {station ? (
            confirmDelete ? (
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-red-700">¿Confirmás?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  disabled={submitting}
                >
                  Sí, borrar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={submitting}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Borrar
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" form="station-form" disabled={submitting}>
              {submitting ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
