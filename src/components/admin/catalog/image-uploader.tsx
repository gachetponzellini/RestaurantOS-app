"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ImageUploader({
  businessId,
  value,
  onChange,
  bucket = "products",
  pathPrefix,
  variant = "avatar-square",
  layout = "auto",
  returnPath = false,
}: {
  businessId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  bucket?: string;
  pathPrefix?: string;
  variant?: "avatar-square" | "avatar-circle" | "cover";
  layout?: "auto" | "stacked";
  returnPath?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo imágenes.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB.");
      return;
    }
    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const prefix = pathPrefix ? `${pathPrefix}-` : "";
      const path = `${businessId}/${prefix}${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        console.error(error);
        toast.error("No pudimos subir la imagen.");
        return;
      }
      if (returnPath) {
        onChange(path);
      } else {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        onChange(data.publicUrl);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const isCover = variant === "cover";
  const stacked = layout === "stacked" || isCover;
  const previewClass = isCover
    ? "relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted"
    : stacked
      ? `bg-muted relative mx-auto aspect-square w-full max-w-[160px] overflow-hidden ${variant === "avatar-circle" ? "rounded-full" : "rounded-xl"}`
      : `bg-muted relative size-24 shrink-0 overflow-hidden ${variant === "avatar-circle" ? "rounded-full" : "rounded-lg"}`;
  const sizes = isCover ? "(max-width: 768px) 100vw, 520px" : "160px";
  const wrapperClass = stacked
    ? "flex flex-col gap-3"
    : "flex items-center gap-4";
  const buttonsClass = stacked
    ? "flex items-center justify-center gap-2"
    : "flex flex-col gap-2";

  return (
    <div className={wrapperClass}>
      <div className={previewClass}>
        {value && !returnPath ? (
          <Image
            src={value}
            alt="Imagen"
            fill
            sizes={sizes}
            className="object-cover"
          />
        ) : value && returnPath ? (
          <div className="text-muted-foreground flex size-full items-center justify-center text-xs">
            <ImagePlus className={isCover ? "size-8" : "size-6"} />
          </div>
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <ImagePlus className={isCover ? "size-8" : "size-6"} />
          </div>
        )}
      </div>
      <div className={isCover ? "flex items-center gap-2" : buttonsClass}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Subiendo…" : value ? "Cambiar" : "Subir imagen"}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(null)}
            disabled={uploading}
          >
            <Trash2 className="size-3" />
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}
