"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowLeft,
  // BarChart3,
  CalendarDays,
  Clock,
  History,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  // Megaphone,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Receipt,
  // Tag,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
};

// ─── Nav builder ────────────────────────────────────────────────────────────

function buildNav(slug: string, showBusinessTools: boolean): NavItem[] {
  const adminBase = `/${slug}/admin`;
  const items: NavItem[] = [
    {
      href: adminBase,
      label: "Inicio",
      icon: <LayoutDashboard className="size-5" strokeWidth={1.75} />,
      match: (p) => p === adminBase,
    },
    {
      href: `${adminBase}/local`,
      label: "Local en vivo",
      icon: <ShoppingBag className="size-5" strokeWidth={1.75} />,
      // Match /local + detalles antiguos en /pedidos (que redirigen a /local),
      // pero NO /pedidos/historial que tiene su propio item.
      match: (p) =>
        p === `${adminBase}/local` ||
        p.startsWith(`${adminBase}/local/`) ||
        (p === `${adminBase}/pedidos` ||
          (p.startsWith(`${adminBase}/pedidos/`) &&
            !p.startsWith(`${adminBase}/pedidos/historial`))),
    },
    {
      href: `${adminBase}/pedidos/historial`,
      label: "Pedidos",
      icon: <History className="size-5" strokeWidth={1.75} />,
      match: (p) => p.startsWith(`${adminBase}/pedidos/historial`),
    },
    {
      href: `${adminBase}/clientes`,
      label: "Clientes",
      icon: <Users className="size-5" strokeWidth={1.75} />,
      match: (p) => p.startsWith(`${adminBase}/clientes`),
    },
    {
      href: `${adminBase}/catalogo`,
      label: "Productos e inventario",
      icon: <Package className="size-5" strokeWidth={1.75} />,
      match: (p) =>
        p.startsWith(`${adminBase}/catalogo`) ||
        p.startsWith(`${adminBase}/menu-del-dia`) ||
        p.startsWith(`${adminBase}/stock`),
    },
    {
      href: `${adminBase}/salones`,
      label: "Salones",
      icon: <LayoutGrid className="size-5" strokeWidth={1.75} />,
      match: (p) => p.startsWith(`${adminBase}/salones`),
    },
    {
      href: `${adminBase}/reservas`,
      label: "Reservas",
      icon: <CalendarDays className="size-5" strokeWidth={1.75} />,
      match: (p) => p.startsWith(`${adminBase}/reservas`),
    },
    // MVP: ocultos hasta validar flujos core
    // {
    //   href: `${adminBase}/promociones`,
    //   label: "Promociones",
    //   icon: <Tag className="size-5" strokeWidth={1.75} />,
    //   match: (p) => p.startsWith(`${adminBase}/promociones`),
    // },
    // {
    //   href: `${adminBase}/campanas`,
    //   label: "Campañas",
    //   icon: <Megaphone className="size-5" strokeWidth={1.75} />,
    //   match: (p) => p.startsWith(`${adminBase}/campanas`),
    // },
    // {
    //   href: `${adminBase}/reportes`,
    //   label: "Reportes",
    //   icon: <BarChart3 className="size-5" strokeWidth={1.75} />,
    //   match: (p) => p.startsWith(`${adminBase}/reportes`),
    // },
    {
      href: `${adminBase}/chatbot`,
      label: "Chatbot",
      icon: <MessageSquare className="size-5" strokeWidth={1.75} />,
      match: (p) => p.startsWith(`${adminBase}/chatbot`),
    },
  ];
  if (showBusinessTools) {
    items.push(
      {
        href: `${adminBase}/cajas`,
        label: "Cajas",
        icon: <Wallet className="size-5" strokeWidth={1.75} />,
        match: (p) => p.startsWith(`${adminBase}/cajas`),
      },
      {
        href: `${adminBase}/facturacion`,
        label: "Facturación",
        icon: <Receipt className="size-5" strokeWidth={1.75} />,
        match: (p) => p.startsWith(`${adminBase}/facturacion`),
      },
      {
        href: `${adminBase}/rrhh`,
        label: "RRHH",
        icon: <Clock className="size-5" strokeWidth={1.75} />,
        match: (p) =>
          p.startsWith(`${adminBase}/rrhh`) ||
          p.startsWith(`${adminBase}/empleados`) ||
          p.startsWith(`${adminBase}/usuarios`),
      },
      {
        href: `${adminBase}/configuracion`,
        label: "Ajustes",
        icon: <Settings className="size-5" strokeWidth={1.75} />,
        match: (p) => p.startsWith(`${adminBase}/configuracion`),
      },
    );
  }
  return items;
}

// ─── Dimensiones ────────────────────────────────────────────────────────────

const COLLAPSED_WIDTH = 72;
const EXPANDED_WIDTH = 256;

// ─── Main component ──────────────────────────────────────────────────────────

export function AdminSidebar({
  slug,
  businessId,
  businessName,
  businessLogoUrl = null,
  userEmail,
  userName,
  isPlatformAdmin = false,
  canManageBusiness = false,
  initialPendingCount = 0,
  lowStockCount = 0,
  isActive: _isActive = true,
}: {
  slug: string;
  businessId: string;
  businessName: string;
  businessLogoUrl?: string | null;
  userEmail: string;
  userName?: string | null;
  isPlatformAdmin?: boolean;
  canManageBusiness?: boolean;
  initialPendingCount?: number;
  lowStockCount?: number;
  isActive?: boolean;
}) {
  void _isActive;
  const pathname = usePathname();
  const items = buildNav(slug, canManageBusiness);

  // ── Sidebar expanded / collapsed (hover-driven) ───────────────────────────
  const [expanded, setExpanded] = useState(false);

  // El sidebar siempre ocupa COLLAPSED_WIDTH en el flujo: la versión expandida
  // se renderiza absoluta encima del contenido para no empujarlo al hacer hover.
  // Mantenemos `--admin-sidebar-width` igual al ancho colapsado para que los
  // overlays externos (ej: tab Salón de /admin/local) sigan calibrando su left.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--admin-sidebar-width",
      `${COLLAPSED_WIDTH}px`,
    );
  }, []);

  // ── Pending order badge ───────────────────────────────────────────────────
  const [pendingCount, setPendingCount] = useState(initialPendingCount);

  // ── Realtime subscription ─────────────────────────────────────────────────
  const businessIdRef = useRef(businessId);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`admin-orders-${businessIdRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessIdRef.current}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setPendingCount((c) => c + 1);
            const newOrder = payload.new as {
              order_number?: number;
              customer_name?: string;
            };
            toast(
              `🔔 Pedido #${newOrder.order_number ?? "—"} — ${newOrder.customer_name ?? "cliente"}`,
              { duration: 6000 },
            );
          } else if (payload.eventType === "UPDATE") {
            const newStatus = (payload.new as { status?: string }).status ?? "";
            const isTerminal =
              newStatus === "delivered" || newStatus === "cancelled";
            if (isTerminal) {
              setPendingCount((c) => Math.max(0, c - 1));
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // intentionally empty — runs once, uses ref for businessId

  // ── Tab title ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pendingCount > 0) {
      document.title = `(${pendingCount}) Pedidos · ${businessName}`;
    } else {
      document.title = businessName;
    }
  }, [pendingCount, businessName]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Primary nav (always visible) vs secondary (Empleados / Ajustes — solo
  // canManageBusiness). El divisor está en el último item antes de empleados.
  // Como `secondary` se push-ea al final del array de items por buildNav, basta
  // con slicear desde la cantidad de primary fija; los items de admin van
  // siempre al final.
  const primary = items.slice(0, canManageBusiness ? items.length - 2 : items.length);
  const secondary = canManageBusiness ? items.slice(items.length - 2) : [];

  return (
    <aside
      aria-label="Navegación admin"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{ width: COLLAPSED_WIDTH }}
      className="sticky top-0 z-40 h-screen shrink-0"
    >
      {/* Panel absoluto: queda anclado a la izquierda y crece sobre el contenido
          al hacer hover, sin alterar el layout. */}
      <div
        style={{ width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
        className={cn(
          "absolute inset-y-0 left-0 flex flex-col overflow-hidden",
          "border-r border-zinc-200/70 bg-zinc-50/95 backdrop-blur-xl",
          "shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]",
          "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="flex flex-row items-center gap-2 px-3 pt-3 pb-2">
          <BusinessMark
            slug={slug}
            name={businessName}
            logoUrl={businessLogoUrl}
          />
          <div
            className={cn(
              "min-w-0 flex-1 overflow-hidden transition-opacity duration-200",
              expanded ? "opacity-100 delay-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={!expanded}
          >
            <p className="truncate text-sm font-semibold tracking-tight text-zinc-900">
              {businessName}
            </p>
            <p className="truncate text-[0.65rem] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Panel admin
            </p>
          </div>
        </header>

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav
          aria-label="Navegación principal"
          className={cn(
            "flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pt-1 pb-3",
            expanded ? "px-3" : "items-center px-0",
          )}
        >
          {primary.map((item) => (
            <NavIcon
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.match(pathname)}
              expanded={expanded}
              badge={
                item.label === "Local en vivo" && pendingCount > 0
                  ? pendingCount
                  : item.label === "Productos e inventario" && lowStockCount > 0
                    ? lowStockCount
                    : undefined
              }
            />
          ))}

          {secondary.length > 0 && (
            <>
              <div
                className={cn(
                  "my-2 h-px bg-zinc-200/70",
                  expanded ? "" : "w-8 self-center",
                )}
              />
              {secondary.map((item) => (
                <NavIcon
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={item.match(pathname)}
                  expanded={expanded}
                />
              ))}
            </>
          )}

          {isPlatformAdmin && (
            <>
              <div
                className={cn(
                  "my-2 h-px bg-zinc-200/70",
                  expanded ? "" : "w-8 self-center",
                )}
              />
              <NavIcon
                href="/"
                label="Plataforma"
                icon={<ArrowLeft className="size-5" strokeWidth={1.75} />}
                active={false}
                expanded={expanded}
              />
            </>
          )}
        </nav>

        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />

        {/* ── Footer: user ─────────────────────────────────────────────────── */}
        <div className="flex items-center p-3">
          <UserMenu
            slug={slug}
            userEmail={userEmail}
            userName={userName}
            isPlatformAdmin={isPlatformAdmin}
            expanded={expanded}
          />
        </div>
      </div>
    </aside>
  );
}

// ─── Business mark (logo) ────────────────────────────────────────────────────

function BusinessMark({
  slug,
  name,
  logoUrl,
}: {
  slug: string;
  name: string;
  logoUrl: string | null;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <Link
      href={`/${slug}/admin`}
      aria-label={name}
      title={name}
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl",
        "ring-1 ring-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition",
        "hover:ring-black/20",
      )}
      style={{
        background: "var(--brand)",
        color: "var(--brand-foreground)",
      }}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name}
          fill
          sizes="44px"
          className="object-cover"
        />
      ) : (
        <span className="text-xs font-bold tracking-tight">{initials}</span>
      )}
    </Link>
  );
}

// ─── Nav icon (with optional badge) ─────────────────────────────────────────

function NavIcon({
  href,
  label,
  icon,
  active,
  expanded,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  expanded: boolean;
  badge?: number;
}) {
  if (expanded) {
    return (
      <Link
        href={href}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
          "outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20",
          active
            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/70"
            : "text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900",
        )}
      >
        <span
          className={cn(
            "shrink-0 transition",
            active ? "" : "text-zinc-500 group-hover:text-zinc-900",
          )}
          style={active ? { color: "var(--brand)" } : undefined}
        >
          {icon}
        </span>
        <span className="flex-1 truncate font-medium">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[0.6rem] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
        {active && badge === undefined ? (
          <span
            aria-hidden
            className="absolute right-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full"
            style={{ background: "var(--brand)" }}
          />
        ) : null}
      </Link>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={href}
        aria-label={label}
        className={cn(
          "relative flex size-11 items-center justify-center rounded-2xl transition",
          "outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20",
          active
            ? "bg-white shadow-sm ring-1 ring-zinc-200/70"
            : "text-zinc-500 hover:bg-zinc-200/40 hover:text-zinc-900",
        )}
        style={active ? { color: "var(--brand)" } : undefined}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[0.55rem] font-bold leading-none text-white ring-1 ring-zinc-50"
            style={{ minHeight: "1rem" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
      <Tooltip label={badge ? `${label} (${badge})` : label} />
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2",
        "whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5",
        "text-xs font-medium text-zinc-50 shadow-lg shadow-zinc-900/10",
        "opacity-0 transition-opacity duration-200 group-hover:opacity-100",
      )}
    >
      {label}
    </span>
  );
}

// ─── User menu ───────────────────────────────────────────────────────────────

function UserMenu({
  slug,
  userEmail,
  userName,
  isPlatformAdmin,
  expanded,
}: {
  slug: string;
  userEmail: string;
  userName?: string | null;
  isPlatformAdmin: boolean;
  expanded: boolean;
}) {
  const displayName = userName?.trim() || userEmail.split("@")[0];
  const initials =
    (userName ?? userEmail)
      .split(/\s+|[@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = isPlatformAdmin
      ? "/login"
      : `/${slug}/admin/login`;
  };

  // base-ui's Menu.Trigger genera un id via useId que se desincroniza entre
  // server y client, causando hydration mismatch. Evitamos el SSR del menú
  // pintando un placeholder visualmente idéntico hasta que se monte.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-xl p-1.5",
          expanded ? "w-full" : "",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            "bg-zinc-900 text-zinc-50 text-[0.7rem] font-semibold",
            "ring-1 ring-zinc-900/10",
          )}
        >
          {initials}
        </span>
        {expanded && (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-semibold text-zinc-900">
              {displayName}
            </p>
            <p className="truncate text-[0.65rem] text-zinc-500">{userEmail}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Cuenta"
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-xl p-1.5 outline-none transition",
          "hover:bg-zinc-200/50",
          "focus-visible:ring-2 focus-visible:ring-zinc-900/20",
          expanded ? "w-full" : "",
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            "bg-zinc-900 text-zinc-50 text-[0.7rem] font-semibold",
            "ring-1 ring-zinc-900/10",
          )}
        >
          {initials}
        </span>
        {expanded && (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-semibold text-zinc-900">
              {displayName}
            </p>
            <p className="truncate text-[0.65rem] text-zinc-500">
              {userEmail}
            </p>
          </div>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={10}
          align="end"
          side="top"
          className="z-50"
        >
          <Menu.Popup
            className={cn(
              "min-w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1",
              "shadow-lg shadow-zinc-900/5",
              "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
              "transition-opacity",
            )}
          >
            <div className="border-b border-zinc-100 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-zinc-900">
                {displayName}
              </p>
              <p className="truncate text-xs text-zinc-500">{userEmail}</p>
            </div>
            <Menu.Item
              onClick={handleSignOut}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                "outline-none transition",
                "data-[highlighted]:bg-zinc-100",
              )}
            >
              <LogOut className="size-4" />
              Cerrar sesión
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
