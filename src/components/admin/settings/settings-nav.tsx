"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CreditCard, Palette, Printer, Store } from "lucide-react";

import { cn } from "@/lib/utils";

// Sub-navegación de Ajustes. Mismo lenguaje visual que la nav segmentada del
// catálogo (`catalog-shell`), pero con sub-rutas (`<Link>`) para que cada
// sección sea deep-linkable y cargue sólo sus datos. El item "Ajustes" del
// sidebar sigue matcheando todo `/configuracion/*`.
export function SettingsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}/admin/configuracion`;

  const items = [
    { href: base, label: "Negocio", icon: Store, exact: true },
    { href: `${base}/apariencia`, label: "Apariencia", icon: Palette },
    { href: `${base}/cobros`, label: "Cobros y facturación", icon: CreditCard },
    { href: `${base}/local`, label: "Operación del local", icon: Printer },
    { href: `${base}/notificaciones`, label: "Notificaciones", icon: Bell },
  ];

  return (
    <nav
      aria-label="Secciones de ajustes"
      className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-zinc-200/70"
    >
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              active
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900",
            )}
          >
            <Icon
              className="size-4 shrink-0"
              strokeWidth={1.75}
              style={active ? { color: "var(--brand)" } : undefined}
            />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
