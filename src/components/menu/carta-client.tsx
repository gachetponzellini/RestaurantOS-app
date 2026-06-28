"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { ImageTile, StatusDot } from "@/components/delivery/primitives";
import { computeIsOpen, type BusinessHour } from "@/lib/business-hours";
import { formatCurrency } from "@/lib/currency";
import type { MenuCategory, MenuDailyMenu, MenuProduct } from "@/lib/menu";

// Carta SOLO VISUAL (read-only). Misma data y look que MenuClient, pero sin
// carrito: sin botón "+", sin sheets, sin checkout, sin login. El comensal mira
// y le pide al mozo.

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

function ProductRow({ product }: { product: MenuProduct }) {
  const soldOut = !product.is_available;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderBottom: "1px solid var(--hairline)",
        opacity: soldOut ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: -0.1,
            marginBottom: 3,
            textDecoration: soldOut ? "line-through" : "none",
          }}
        >
          {product.name}
        </div>
        {product.description && (
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            {product.description}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 300, color: "var(--ink)" }}>
            {formatCurrency(product.price_cents)}
          </span>
          {soldOut && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 4,
                background: "#EEE8DC",
                color: "#8A7B5E",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              Sin stock
            </span>
          )}
        </div>
      </div>
      {product.image_url && (
        <ImageTile
          src={product.image_url}
          alt={product.name}
          tone="#D9C9A8"
          sizes="88px"
          style={{ width: 88, height: 88 }}
        />
      )}
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
  const preview = menu.components.slice(0, 3);
  const more = menu.components.length - preview.length;
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: 12,
        marginTop: 10,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid rgba(197, 135, 43, 0.18)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {menu.image_url && (
        <ImageTile
          src={menu.image_url}
          alt={menu.name}
          tone="#E9C88A"
          sizes="96px"
          style={{ width: 96, height: 96, borderRadius: 10, flexShrink: 0 }}
        />
      )}
      <div
        style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: -0.15,
            }}
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
                color: "#9A6B1E",
                background: "rgba(197, 135, 43, 0.12)",
                padding: "2px 6px",
                borderRadius: 4,
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
              fontSize: 12.5,
              color: "var(--ink-2)",
              lineHeight: 1.35,
              marginBottom: 6,
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
            fontSize: 12.5,
            color: "var(--ink-2)",
            lineHeight: 1.35,
          }}
        >
          {preview.map((c) => (
            <li
              key={c.id}
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              · {c.label}
            </li>
          ))}
          {more > 0 && (
            <li style={{ color: "var(--ink-3)", fontSize: 11.5 }}>+{more} más</li>
          )}
        </ul>
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
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

  const sectionBg = "linear-gradient(180deg, #FFF7E5 0%, #FDF4E1 100%)";
  return (
    <>
      {regular.length > 0 && (
        <section
          style={{ background: sectionBg, borderBottom: "1px solid var(--hairline)" }}
        >
          <header style={{ padding: "14px 16px 6px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 99,
                background: "rgba(0,0,0,0.06)",
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "var(--ink-2)",
              }}
            >
              <span
                style={{ width: 6, height: 6, borderRadius: 99, background: "#C5872B" }}
              />
              Menú del día
            </div>
            <div
              className="d-display"
              style={{
                marginTop: 6,
                fontSize: 20,
                lineHeight: 1.15,
                color: "var(--ink)",
                textTransform: "capitalize",
              }}
            >
              Hoy — {todayLabel}
            </div>
          </header>
          <div style={{ padding: "4px 16px 14px" }}>
            {regular.map((m) => (
              <DailyMenuCard key={m.id} menu={m} />
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section
          style={{ background: sectionBg, borderBottom: "1px solid var(--hairline)" }}
        >
          <header style={{ padding: "14px 16px 6px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 99,
                background: "rgba(197, 135, 43, 0.15)",
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "#9A6B1E",
              }}
            >
              <span
                style={{ width: 6, height: 6, borderRadius: 99, background: "#C5872B" }}
              />
              Sugerencia del día
            </div>
          </header>
          <div style={{ padding: "4px 16px 14px" }}>
            {suggestions.map((m) => (
              <DailyMenuCard key={m.id} menu={m} isSuggestion />
            ))}
          </div>
        </section>
      )}
    </>
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
        maxWidth: 520,
        margin: "0 auto",
        minHeight: "100vh",
        paddingBottom: 24,
        background: "var(--bg)",
      }}
    >
      {/* Hero */}
      <ImageTile
        src={coverImageUrl}
        alt={businessName}
        tone="#C9B792"
        radius={0}
        sizes="520px"
        priority
        style={{ height: 160 }}
      />

      {/* Tenant info */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {logoUrl && (
            <div
              style={{
                position: "relative",
                width: 40,
                height: 40,
                borderRadius: 999,
                overflow: "hidden",
                flexShrink: 0,
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                border: "1px solid var(--hairline)",
              }}
            >
              <Image
                src={logoUrl}
                alt={businessName}
                fill
                sizes="40px"
                style={{ objectFit: "cover" }}
              />
            </div>
          )}
          <div
            className="d-display"
            style={{ fontSize: 32, lineHeight: 1.05, color: "var(--ink)" }}
          >
            {businessName}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 6,
            flexWrap: "wrap",
          }}
        >
          {tagline && (
            <>
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{tagline}</span>
              <span style={{ color: "var(--hairline-2)" }}>·</span>
            </>
          )}
          <StatusDot status={isOpen ? "open" : "closed"} />
        </div>
      </div>

      {/* Menú del día */}
      <DailyMenu menus={todaysMenus} todayLabel={todayLabel} />

      {/* Sticky category tabs */}
      {displayTabs.length > 0 && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 4,
            background: "var(--bg)",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 20,
              overflowX: "auto",
              padding: "4px 16px 0",
              scrollbarWidth: "none",
            }}
            className="no-scrollbar"
          >
            {displayTabs.map((t) => {
              const isActive = t.id === active;
              return (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  style={{
                    flexShrink: 0,
                    padding: "12px 0 10px",
                    background: "none",
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid var(--ink)"
                      : "2px solid transparent",
                    color: isActive ? "var(--ink)" : "var(--ink-3)",
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    cursor: "pointer",
                    marginBottom: -1,
                  }}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Products */}
      <div>
        {activeTab?.subcategories
          ? activeTab.subcategories.map((sub) => (
              <div key={sub.name}>
                <div
                  style={{
                    padding: "14px 16px 6px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink-2)",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {sub.name}
                </div>
                {sub.products.map((p) => (
                  <ProductRow key={p.id} product={p} />
                ))}
              </div>
            ))
          : activeTab?.products.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
        {activeTab && activeTab.products.length === 0 && (
          <div
            style={{
              padding: "40px 16px",
              textAlign: "center",
              color: "var(--ink-3)",
              fontSize: 14,
            }}
          >
            Sin productos en esta categoría.
          </div>
        )}
      </div>
    </div>
  );
}
