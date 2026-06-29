"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Building2, LogOut, Menu as MenuIcon, MoreHorizontal } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AdminSection } from "@/lib/permissions/sections";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

import type { NavGroup, NavItem } from "@/components/admin/admin-sidebar";

// Secciones que aparecen en la bottom-bar (por orden de prioridad). Se filtran
// contra las que el rol realmente ve, así un encargado obtiene las suyas sin
// reportes/cajas. Tomamos las primeras 4 + el botón "Más" (abre el drawer).
const PRIMARY_SECTIONS: AdminSection[] = [
  "dashboard",
  "operacion",
  "reportes",
  "reservas",
  "cajas",
  "clientes",
];

function badgeFor(
  item: NavItem,
  pendingCount: number,
  lowStockCount: number,
): number | undefined {
  if (item.label === "Operación Diaria" && pendingCount > 0) return pendingCount;
  if (item.label === "Productos e inventario" && lowStockCount > 0)
    return lowStockCount;
  return undefined;
}

export function AdminMobileNav({
  groups,
  slug,
  pathname,
  pendingCount,
  lowStockCount,
  businessName,
  businessLogoUrl,
  userEmail,
  userName,
  isPlatformAdmin,
  siblings,
}: {
  groups: NavGroup[];
  slug: string;
  pathname: string;
  pendingCount: number;
  lowStockCount: number;
  businessName: string;
  businessLogoUrl: string | null;
  userEmail: string;
  userName?: string | null;
  isPlatformAdmin: boolean;
  siblings: { slug: string; name: string; logoUrl: string | null }[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const flat = groups.flatMap((g) => g.items);
  const bySection = new Map(flat.map((it) => [it.section, it]));
  const primary = PRIMARY_SECTIONS.map((s) => bySection.get(s)).filter(
    (it): it is NavItem => Boolean(it),
  );
  // Si el rol ve muy pocas secciones, igualmente reservamos el slot "Más".
  const primarySlots = primary.slice(0, 4);

  const initials =
    businessName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const mark = (
    <span
      className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-black/10"
      style={{ background: "var(--brand)", color: "var(--brand-foreground)" }}
    >
      {businessLogoUrl ? (
        <Image
          src={businessLogoUrl}
          alt={businessName}
          fill
          sizes="32px"
          className="object-cover"
        />
      ) : (
        <span className="text-[0.65rem] font-bold tracking-tight">
          {initials}
        </span>
      )}
    </span>
  );

  return (
    <>
      {/* ── Top bar (mobile) ──────────────────────────────────────────────
          Fija arriba. El bell de notificaciones es fixed right-4 top-3 z-50,
          así que dejamos el lado derecho libre con pr-14. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-zinc-200/70 bg-zinc-50/95 px-3 pr-14 backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 transition hover:bg-zinc-200/50 active:bg-zinc-200/70"
        >
          <MenuIcon className="size-5" strokeWidth={1.75} />
        </button>
        <Link
          href={`/${slug}/admin`}
          className="flex min-w-0 items-center gap-2"
        >
          {mark}
          <span className="truncate text-sm font-semibold tracking-tight text-zinc-900">
            {businessName}
          </span>
        </Link>
      </header>

      {/* ── Bottom bar (mobile) ───────────────────────────────────────────── */}
      <nav
        aria-label="Navegación rápida"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-zinc-200/70 bg-zinc-50/95 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primarySlots.map((item) => {
          const active = item.match(pathname);
          const badge = badgeFor(item, pendingCount, lowStockCount);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.6rem] font-medium transition",
                active ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800",
              )}
            >
              <span
                className="relative"
                style={active ? { color: "var(--brand)" } : undefined}
              >
                {item.icon}
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex min-w-[0.95rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[0.5rem] font-bold leading-none text-white ring-1 ring-zinc-50">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.6rem] font-medium text-zinc-500 transition hover:text-zinc-800"
        >
          <MoreHorizontal className="size-[18px]" strokeWidth={1.75} />
          <span>Más</span>
        </button>
      </nav>

      {/* ── Drawer (menú completo) ────────────────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[84%] max-w-xs gap-0 bg-zinc-50 p-0"
        >
          <SheetHeader className="border-b border-zinc-200/70 p-4">
            <SheetTitle className="flex items-center gap-2.5 text-left">
              {mark}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight text-zinc-900">
                  {businessName}
                </span>
                <span className="block truncate text-[0.65rem] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Panel admin
                </span>
              </span>
            </SheetTitle>
            <SheetDescription className="sr-only">
              Navegación del panel de administración
            </SheetDescription>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {groups.map((group, gi) => (
              <div key={group.label} className="flex flex-col gap-0.5">
                {gi > 0 && <div className="my-2 h-px bg-zinc-200/70" />}
                <p className="px-2.5 pb-1 text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const active = item.match(pathname);
                  const badge = badgeFor(item, pendingCount, lowStockCount);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition",
                        active
                          ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/70"
                          : "text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900",
                      )}
                    >
                      <span
                        className="shrink-0"
                        style={active ? { color: "var(--brand)" } : undefined}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate font-medium">
                        {item.label}
                      </span>
                      {badge !== undefined && badge > 0 && (
                        <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 py-px text-[0.55rem] font-bold leading-none text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}

            {isPlatformAdmin && (
              <>
                <div className="my-2 h-px bg-zinc-200/70" />
                <Link
                  href="/"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-zinc-600 transition hover:bg-zinc-200/40 hover:text-zinc-900"
                >
                  <Building2 className="size-[18px]" strokeWidth={1.75} />
                  <span className="flex-1 truncate">Plataforma</span>
                </Link>
              </>
            )}
          </nav>

          {/* ── Footer: usuario + (cambiar local) + salir ─────────────────── */}
          <div className="mt-auto border-t border-zinc-200/70 p-3">
            {siblings.length >= 2 && (
              <Link
                href="/mis-locales"
                onClick={() => setDrawerOpen(false)}
                className="mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-zinc-600 transition hover:bg-zinc-200/40 hover:text-zinc-900"
              >
                <Building2 className="size-[18px]" strokeWidth={1.75} />
                <span className="flex-1 truncate">Cambiar de local</span>
              </Link>
            )}
            <div className="flex items-center gap-2.5 px-2.5 py-1.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[0.7rem] font-semibold text-zinc-50 ring-1 ring-zinc-900/10">
                {(userName ?? userEmail)
                  .split(/\s+|[@.]/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase() ?? "")
                  .join("") || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-zinc-900">
                  {userName?.trim() || userEmail.split("@")[0]}
                </p>
                <p className="truncate text-[0.65rem] text-zinc-500">
                  {userEmail}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar sesión"
                onClick={async () => {
                  const supabase = createSupabaseBrowserClient();
                  await supabase.auth.signOut();
                  window.location.href = isPlatformAdmin
                    ? "/login"
                    : `/${slug}/admin/login`;
                }}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-200/50 hover:text-zinc-900"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
