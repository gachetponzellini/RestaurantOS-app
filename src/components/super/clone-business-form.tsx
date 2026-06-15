"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cloneBusiness } from "@/lib/platform/actions";

const Schema = z.object({
  name: z.string().min(1, "Requerido.").max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones."),
  timezone: z.string().min(1),
  admin_email: z.string().email("Email inválido."),
});

type Values = z.infer<typeof Schema>;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export function CloneBusinessForm({
  sourceBusinessId,
  sourceBusinessName,
}: {
  sourceBusinessId: string;
  sourceBusinessName: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: "",
      slug: "",
      timezone: "America/Argentina/Buenos_Aires",
      admin_email: "",
    },
  });

  const autoSlug = form.watch("slug") === "";
  const nameValue = form.watch("name");

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      const result = await cloneBusiness({
        ...values,
        source_business_id: sourceBusinessId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Local clonado desde ${sourceBusinessName}. Invitación enviada a ${values.admin_email}.`,
      );
      window.location.href = `/negocios/${result.data.id}`;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm text-zinc-600">
            Clonando estructura desde{" "}
            <span className="font-semibold text-zinc-900">
              {sourceBusinessName}
            </span>
            . Se copia el catálogo, sectores, salones, mesas y configuración.
            Las credenciales (MP, ARCA, WhatsApp) no se copian.
          </p>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del nuevo local</FormLabel>
              <FormControl>
                <Input
                  autoFocus
                  placeholder="Golf Restaurant"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    if (autoSlug) {
                      form.setValue("slug", slugify(e.target.value), {
                        shouldValidate: false,
                      });
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Slug <span className="text-muted-foreground">(URL)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="golf" {...field} />
              </FormControl>
              <FormMessage />
              {nameValue && !field.value && (
                <p className="text-muted-foreground text-xs">
                  Se genera automáticamente desde el nombre.
                </p>
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Zona horaria</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="admin_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email del admin del nuevo local</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="admin@ejemplo.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
              <p className="text-muted-foreground text-xs">
                Le enviamos un mail con un link para que configure su
                contraseña.
              </p>
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Clonando…" : "Clonar e invitar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
