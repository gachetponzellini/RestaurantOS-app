import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton del home del mozo (spec 39, FR-001/FR-002): header sticky (negocio +
 * acciones) + grilla de mesas, para que la vuelta al salón muestre la
 * estructura al instante en lugar de la pantalla anterior congelada.
 */
export default function Loading() {
  return (
    <div className="min-h-dvh bg-zinc-50 pb-20">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-screen-md items-center justify-between px-4 py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-md px-4 pt-4">
        <Skeleton className="mb-4 h-9 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
