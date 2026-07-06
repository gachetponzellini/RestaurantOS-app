"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { ImageTile, StatusDot } from "@/components/delivery/primitives";
import { computeIsOpen, type BusinessHour } from "@/lib/business-hours";
import { formatCurrency } from "@/lib/currency";
import type { MenuCategory, MenuDailyMenu, MenuProduct } from "@/lib/menu";

// Carta SOLO VISUAL (read-only) para el QR de la mesa. El comensal mira y le
// pide al mozo: sin carrito, sin "+", sin checkout. Estética de carta impresa
// (serif de display, secciones, líder de puntos plato···precio). Reusa el mismo
// catálogo (getMenu) que /menu.

type DisplayTab = {
  id: string;
  name: string;
  products: MenuProduct[];
  subcategories?: { name: string; products: MenuProduct[] }[];
};

function buildDisplayTabs(
  categories: MenuCategory[],
  beverageSuperCategoryId: string | null,
): DisplayTab[] {
  const flat = (cs: MenuCategory[]) =>
    cs.map((c) => ({ id: c.id, name: c.name, products: c.products }));

  if (!beverageSuperCategoryId) return flat(categories);

  const bevCats = categories.filter(
    (c) => c.super_category_id === beverageSuperCategoryId,
  );
  const nonBevCats = categories.filter(
    (c) => c.super_category_id !== beverageSuperCategoryId,
  );
  if (bevCats.length === 0) return flat(categories);

  const tabs: DisplayTab[] = flat(nonBevCats);
  tabs.push({
    id: "bebidas-grouped",
    name: "Bebidas",
    products: bevCats.flatMap((c) => c.products),
    subcategories: bevCats.map((c) => ({ name: c.name, products: c.products })),
  });
  return tabs;
}

// Fila de plato con líder de puntos: nombre ······ precio, descripción debajo.
function ProductRow({ product }: { product: MenuProduct }) {
  const soldOut = !product.is_available;
  return (
    <li
      style={{
        listStyle: "none",
        display: "flex",
        gap: 14,
        padding: "13px 0",
        borderBottom: "1px solid var(--hairline)",
        opacity: soldOut ? 0.5 : 1,
      }}
    >
      {product.image_url && (
        <ImageTile
          src={product.image_url}
          alt={product.name}
          tone="#D9C9A8"
          radius={10}
          sizes="72px"
          style={{ width: 72, height: 72, flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Nombre ······ Precio */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 0 }}>
          <span
            className="d-display"
            style={{
              fontSize: 18,
              lineHeight: 1.2,
              color: "var(--ink)",
              textDecoration: soldOut ? "line-through" : "none",
            }}
          >
            {product.name}
          </span>
          <span
            aria-hidden
            style={{
              flex: 1,
              margin: "0 8px 5px",
              borderBottom: "1.5px dotted var(--hairline-2)",
              minWidth: 16,
            }}
          />
          <span
            className="d-display"
            style={{
              fontSize: 16,
              color: "var(--ink)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {formatCurrency(product.price_cents)}
          </span>
        </div>
        {product.description && (
          <div
            style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ink-2)",
              lineHeight: 1.4,
              marginTop: 4,
              maxWidth: "42ch",
            }}
          >
            {product.description}
          </div>
        )}
        {soldOut && (
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              fontSize: 10.5,
              padding: "2px 7px",
              borderRadius: 4,
              background: "var(--hairline)",
              color: "var(--ink-2)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Sin stock
          </span>
        )}
      </div>
    </li>
  );
}

// Cenefa: título de sección centrado con reglas finas a los lados.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "26px 0 12px",
      }}
    >
      <span style={{ flex: 1, height: 1, background: "var(--hairline-2)" }} />
      <h2
        className="d-display"
        style={{
          margin: 0,
          fontSize: 24,
          lineHeight: 1,
          color: "var(--ink)",
          textAlign: "center",
        }}
      >
        {children}
      </h2>
      <span style={{ flex: 1, height: 1, background: "var(--hairline-2)" }} />
    </div>
  );
}

function DailyMenuCard({
  menu,
  isSuggestion,
}: {
  menu: MenuDailyMenu;
  isSuggestion?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: 14,
        marginTop: 10,
        background: "var(--bg)",
        borderRadius: 14,
        border: "1px solid var(--accent-soft)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {menu.image_url && (
        <ImageTile
          src={menu.image_url}
          alt={menu.name}
          tone="#E9C88A"
          radius={10}
          sizes="96px"
          style={{ width: 96, height: 96, flexShrink: 0 }}
        />
      )}
      <div
        style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      >
        <div
          style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}
        >
          <span
            className="d-display"
            style={{ fontSize: 19, color: "var(--ink)", lineHeight: 1.15 }}
          >
            {menu.name}
          </span>
          {isSuggestion && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--accent)",
                flexShrink: 0,
              }}
            >
              Sugerencia
            </span>
          )}
        </div>
        {menu.description && (
          <div
            style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ink-2)",
              lineHeight: 1.4,
              marginBottom: 8,
            }}
          >
            {menu.description}
          </div>
        )}
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.4,
          }}
        >
          {menu.components.map((c) => (
            <li key={c.id}>· {c.label}</li>
          ))}
        </ul>
        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          <span
            className="d-display"
            style={{ fontSize: 18, color: "var(--ink)" }}
          >
            {formatCurrency(menu.price_cents)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DailyMenu({
  menus,
  todayLabel,
}: {
  menus: MenuDailyMenu[];
  todayLabel: string;
}) {
  const regular = menus.filter((m) => !m.is_suggestion);
  const suggestions = menus.filter((m) => m.is_suggestion);
  if (menus.length === 0) return null;

  return (
    <div
      style={{
        padding: "18px 20px 22px",
        background: "var(--accent-soft)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "var(--accent)",
          textAlign: "center",
        }}
      >
        Menú del día
      </div>
      <div
        className="d-display"
        style={{
          marginTop: 4,
          fontSize: 20,
          lineHeight: 1.15,
          color: "var(--ink)",
          textAlign: "center",
          textTransform: "capitalize",
        }}
      >
        {todayLabel}
      </div>
      {regular.map((m) => (
        <DailyMenuCard key={m.id} menu={m} />
      ))}
      {suggestions.map((m) => (
        <DailyMenuCard key={m.id} menu={m} isSuggestion />
      ))}
    </div>
  );
}

export function CartaClient({
  businessName,
  tagline,
  coverImageUrl,
  logoUrl,
  categories,
  beverageSuperCategoryId,
  todaysMenus,
  todayLabel,
  hours,
  timezone,
  isOpenInitial,
}: {
  businessName: string;
  tagline: string | null;
  coverImageUrl: string | null;
  logoUrl: string | null;
  categories: MenuCategory[];
  beverageSuperCategoryId: string | null;
  todaysMenus: MenuDailyMenu[];
  todayLabel: string;
  hours: BusinessHour[];
  timezone: string;
  isOpenInitial: boolean;
}) {
  const displayTabs = useMemo(
    () => buildDisplayTabs(categories, beverageSuperCategoryId),
    [categories, beverageSuperCategoryId],
  );
  const [active, setActive] = useState(displayTabs[0]?.id ?? "");
  const [isOpen, setIsOpen] = useState(isOpenInitial);
  useEffect(() => {
    const tick = () => setIsOpen(computeIsOpen(hours, timezone));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [hours, timezone]);

  const activeTab = useMemo(
    () => displayTabs.find((t) => t.id === active) ?? displayTabs[0],
    [active, displayTabs],
  );

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        minHeight: "100vh",
        paddingBottom: 40,
        background: "var(--bg)",
      }}
    >
      {/* ── Masthead ── */}
      {coverImageUrl ? (
        <div style={{ position: "relative", height: 220 }}>
          <Image
            src={coverImageUrl}
            alt={businessName}
            fill
            priority
            sizes="560px"
            style={{ objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(20,14,8,0.15) 0%, rgba(20,14,8,0.72) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "0 20px 20px",
              textAlign: "center",
            }}
          >
            {logoUrl && (
              <div
                style={{
                  position: "relative",
                  width: 56,
                  height: 56,
                  margin: "0 auto 8px",
                  borderRadius: 999,
                  overflow: "hidden",
                  border: "2px solid rgba(255,255,255,0.85)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                }}
              >
                <Image
                  src={logoUrl}
                  alt={businessName}
                  fill
                  sizes="56px"
                  style={{ objectFit: "cover" }}
                />
              </div>
            )}
            <div
              className="d-display"
              style={{
                fontSize: 38,
                lineHeight: 1.05,
                color: "#fff",
                textShadow: "0 1px 12px rgba(0,0,0,0.4)",
              }}
            >
              {businessName}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: "36px 20px 20px", textAlign: "center" }}>
          {logoUrl && (
            <div
              style={{
                position: "relative",
                width: 64,
                height: 64,
                margin: "0 auto 12px",
                borderRadius: 999,
                overflow: "hidden",
                border: "1px solid var(--hairline)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <Image
                src={logoUrl}
                alt={businessName}
                fill
                sizes="64px"
                style={{ objectFit: "cover" }}
              />
            </div>
          )}
          <div
            className="d-display"
            style={{ fontSize: 40, lineHeight: 1.05, color: "var(--ink)" }}
          >
            {businessName}
          </div>
        </div>
      )}

      {/* ── Sub-masthead: tagline + estado ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "14px 20px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        {tagline && (
          <span
            style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ink-2)",
              textAlign: "center",
            }}
          >
            {tagline}
          </span>
        )}
        {tagline && <span style={{ color: "var(--hairline-2)" }}>·</span>}
        <StatusDot status={isOpen ? "open" : "closed"} />
      </div>

      {/* ── Menú del día ── */}
      <DailyMenu menus={todaysMenus} todayLabel={todayLabel} />

      {/* ── Nav de categorías (sticky) ── */}
      {displayTabs.length > 0 && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 4,
            background: "color-mix(in oklch, var(--bg) 92%, transparent)",
            backdropFilter: "saturate(180%) blur(8px)",
            WebkitBackdropFilter: "saturate(180%) blur(8px)",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <div
            className="no-scrollbar"
            style={{
              display: "flex",
              gap: 22,
              overflowX: "auto",
              padding: "0 20px",
              scrollbarWidth: "none",
            }}
          >
            {displayTabs.map((t) => {
              const isActive = t.id === active;
              return (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  style={{
                    flexShrink: 0,
                    padding: "13px 0 11px",
                    background: "none",
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    color: isActive ? "var(--ink)" : "var(--ink-3)",
                    fontSize: 13.5,
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: 0.2,
                    cursor: "pointer",
                    marginBottom: -1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Platos de la categoría activa ── */}
      <div style={{ padding: "0 20px" }}>
        {activeTab?.subcategories ? (
          activeTab.subcategories.map((sub) => (
            <div key={sub.name}>
              <SectionTitle>{sub.name}</SectionTitle>
              <ul style={{ margin: 0, padding: 0 }}>
                {sub.products.map((p) => (
                  <ProductRow key={p.id} product={p} />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <>
            {activeTab && <SectionTitle>{activeTab.name}</SectionTitle>}
            <ul style={{ margin: 0, padding: 0 }}>
              {activeTab?.products.map((p) => (
                <ProductRow key={p.id} product={p} />
              ))}
            </ul>
          </>
        )}
        {activeTab && activeTab.products.length === 0 && (
          <div
            style={{
              padding: "48px 16px",
              textAlign: "center",
              color: "var(--ink-3)",
              fontSize: 14,
              fontStyle: "italic",
            }}
          >
            Sin productos en esta categoría.
          </div>
        )}
      </div>
    </div>
  );
}
