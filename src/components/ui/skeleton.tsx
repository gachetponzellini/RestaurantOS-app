import { cn } from "@/lib/utils";

/**
 * Bloque de carga base (shimmer). Primitiva reutilizable para que cada
 * `loading.tsx` / fallback de Suspense calque la estructura del destino sin
 * duplicar la maqueta (spec 39, FR-003). No lleva contenido: solo forma.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-zinc-200/70", className)}
      {...props}
    />
  );
}
