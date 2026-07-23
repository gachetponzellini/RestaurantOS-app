"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowLeft,
  Bike,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/currency";
import type { CatalogForMozo, CatalogProduct } from "@/lib/mozo/catalog-query";
import { loadPedirCatalog } from "@/lib/mozo/pedir-panel-data";
import { confirmarPedido } from "@/lib/orders/confirm-order";
import { cargarPedidoStaff } from "@/lib/orders/staff-order";
import { ProductModal, type AddToCartItem } from "@/components/mozo/product-modal";

type CartItem = AddToCartItem & { _key: string };
type DeliveryType = "pickup" | "delivery";
type Step = "catalogo" | "datos";

/**
 * Spec 054 — «Cargar pedido» para llevar / delivery SIN mesa desde el board de
 * pedidos online. Reusa el picker (`ProductModal`) y el loader de catálogo
 * (`loadPedirCatalog`) del flujo de mesa, pero arma el pedido con
 * `cargarPedidoStaff` → `persistOrder` (sin `table_id`). NO adapta
 * `MozoPedirClient` (fuertemente atado a mesa): es un componente autocontenido.
 *
 * El cobro es aparte (botón «Cobrar/Facturar» en la card). Fase 1: sólo
 * productos (los menús del día se suman después).
 */
export function CargarPedidoSheet({
  slug,
  open,
  onClose,
  onCreated,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** Corre tras crear el pedido con éxito (ej: refrescar / feedback). */
  onCreated?: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogForMozo | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("catalogo");
  const [search, setSearch] = useState("");
  const [openProduct, setOpenProduct] = useState<CatalogProduct | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [deliveryType, setDeliveryType] = useState<DeliveryType>("pickup");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const [pending, startTransition] = useTransition();

  // Cargar el catálogo al abrir (lazy). Si el salón ya lo prefetcheó, esta
  // action vuelve rápido (misma query cacheada server-side).
  useEffect(() => {
    if (!open || catalog || loadingCatalog) return;
    setLoadingCatalog(true);
    setCatalogError(null);
    loadPedirCatalog(slug).then((r) => {
      if (r.ok) setCatalog(r.data.catalog);
      else setCatalogError(r.error);
      setLoadingCatalog(false);
    });
  }, [open, slug, catalog, loadingCatalog]);

  function reset() {
    setStep("catalogo");
    setSearch("");
    setCart([]);
    setDeliveryType("pickup");
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setDeliveryNotes("");
  }

  if (!open) return null;

  const allProducts: CatalogProduct[] =
    catalog?.categories.flatMap((c) => c.products) ?? [];
  const q = search.trim().toLowerCase();
  const sections = q
    ? [
        {
          name: "Resultados",
          products: allProducts.filter((p) =>
            p.name.toLowerCase().includes(q),
          ),
        },
      ]
    : (catalog?.categories ?? [])
        .filter((c) => c.products.length > 0)
        .map((c) => ({ name: c.name, products: c.products }));

  const cartTotal = cart.reduce((a, c) => a + c.line_subtotal_cents, 0);
  const cartCount = cart.reduce((a, c) => a + c.quantity, 0);

  function addToCart(item: AddToCartItem) {
    setCart((prev) => [...prev, { ...item, _key: crypto.randomUUID() }]);
  }
  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((c) => c._key !== key));
  }
  function changeQty(key: string, delta: number) {
    setCart((prev) =>
      prev.map((c) => {
        if (c._key !== key) return c;
        const nextQty = c.quantity + delta;
        if (nextQty < 1 || nextQty > 99) return c;
        const modsTotal = c.modifiers.reduce(
          (a, m) => a + m.price_delta_cents,
          0,
        );
        return {
          ...c,
          quantity: nextQty,
          line_subtotal_cents: (c.unit_price_cents + modsTotal) * nextQty,
        };
      }),
    );
  }

  function buildInput() {
    return {
      business_slug: slug,
      delivery_type: deliveryType,
      customer_name: customerName.trim() || undefined,
      customer_phone: customerPhone.trim() || undefined,
      delivery_address:
        deliveryType === "delivery"
          ? deliveryAddress.trim() || undefined
          : undefined,
      delivery_notes: deliveryNotes.trim() || undefined,
      items: cart.map((c) => ({
        product_id: c.product_id,
        quantity: c.quantity,
        notes: c.notes || undefined,
        modifier_ids: c.modifiers.map((m) => m.id),
      })),
    };
  }

  function submit(marchar: boolean) {
    if (cart.length === 0) {
      toast.error("Agregá al menos un producto.");
      return;
    }
    startTransition(async () => {
      const r = await cargarPedidoStaff(buildInput());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (marchar) {
        const c = await confirmarPedido(r.data.order_id, slug);
        if (!c.ok) {
          toast.warning(`Pedido #${r.data.order_number} cargado, pero no marchó: ${c.error}`);
        } else {
          toast.success(`Pedido #${r.data.order_number} cargado y enviado a cocina`);
        }
      } else {
        toast.success(`Pedido #${r.data.order_number} cargado`);
      }
      reset();
      onCreated?.();
      onClose();
    });
  }

  const canSubmit =
    cart.length > 0 &&
    !pending &&
    (deliveryType === "pickup" ||
      (deliveryAddress.trim().length > 0 && customerPhone.trim().length >= 6));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-zinc-50 shadow-2xl"
      >
        {/* ─── Header ─── */}
        <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            {step === "datos" ? (
              <button
                onClick={() => setStep("catalogo")}
                className="-ml-1 rounded-full p-2 text-zinc-700 active:bg-zinc-100"
                aria-label="Volver al catálogo"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <ShoppingBag className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Cargar pedido
              </p>
              <h2 className="font-heading text-base font-bold leading-tight text-zinc-900">
                {step === "catalogo" ? "Elegí los productos" : "Datos y cobro"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-zinc-500 active:bg-zinc-100"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Toggle pickup / delivery */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setDeliveryType("pickup")}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition ${
                deliveryType === "pickup"
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200"
              }`}
            >
              <ShoppingBag className="h-4 w-4" /> Para llevar
            </button>
            <button
              onClick={() => setDeliveryType("delivery")}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition ${
                deliveryType === "delivery"
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200"
              }`}
            >
              <Bike className="h-4 w-4" /> Delivery
            </button>
          </div>
        </header>

        {/* ─── Body ─── */}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {step === "catalogo" ? (
            loadingCatalog ? (
              <div className="flex h-40 items-center justify-center text-zinc-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : catalogError ? (
              <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 py-10 text-center">
                <p className="text-sm font-semibold text-red-700">{catalogError}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="block h-11 w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                {sections.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-white py-10 text-center">
                    <p className="text-sm font-semibold text-zinc-700">
                      Sin productos
                    </p>
                  </div>
                ) : (
                  sections.map((section) => (
                    <section key={section.name} className="space-y-2">
                      <h3 className="px-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
                        {section.name}
                      </h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {section.products.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setOpenProduct(p)}
                            className="flex min-h-[84px] flex-col justify-between rounded-2xl bg-white p-3 text-left ring-1 ring-zinc-200 transition active:scale-[0.97] active:bg-zinc-50"
                          >
                            <span className="line-clamp-2 text-sm font-semibold text-zinc-900">
                              {p.name}
                            </span>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-sm font-bold text-emerald-700 tabular-nums">
                                {formatCurrency(p.price_cents)}
                              </span>
                              <span className="rounded-full bg-emerald-50 p-1 text-emerald-700">
                                <Plus className="h-3.5 w-3.5" />
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            )
          ) : (
            <DatosStep
              cart={cart}
              deliveryType={deliveryType}
              customerName={customerName}
              customerPhone={customerPhone}
              deliveryAddress={deliveryAddress}
              deliveryNotes={deliveryNotes}
              onChangeQty={changeQty}
              onRemove={removeFromCart}
              onName={setCustomerName}
              onPhone={setCustomerPhone}
              onAddress={setDeliveryAddress}
              onNotes={setDeliveryNotes}
              onAddMore={() => setStep("catalogo")}
            />
          )}
        </main>

        {/* ─── Footer ─── */}
        <footer className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3">
          {step === "catalogo" ? (
            <button
              onClick={() => setStep("datos")}
              disabled={cart.length === 0}
              className="flex h-12 w-full items-center justify-between rounded-2xl bg-zinc-900 px-4 text-white transition active:scale-[0.98] disabled:opacity-40"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingBag className="h-4 w-4" />
                {cartCount > 0 ? `Revisar (${cartCount})` : "Elegí productos"}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {formatCurrency(cartTotal)}
              </span>
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => submit(true)}
                disabled={!canSubmit}
                className="flex h-12 w-full items-center justify-between rounded-2xl bg-emerald-600 px-4 text-white transition active:scale-[0.98] disabled:opacity-40"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Cargar y enviar a cocina
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {formatCurrency(cartTotal)}
                </span>
              </button>
              <button
                onClick={() => submit(false)}
                disabled={!canSubmit}
                className="h-10 w-full rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-700 transition active:scale-[0.98] disabled:opacity-40"
              >
                Sólo cargar (marchar después)
              </button>
            </div>
          )}
        </footer>

        {/* Modal de producto — scopeado al panel (embedded → overlay absolute). */}
        <ProductModal
          product={openProduct}
          open={!!openProduct}
          onClose={() => setOpenProduct(null)}
          onAdd={addToCart}
          embedded
        />
      </div>
    </div>
  );
}

function DatosStep({
  cart,
  deliveryType,
  customerName,
  customerPhone,
  deliveryAddress,
  deliveryNotes,
  onChangeQty,
  onRemove,
  onName,
  onPhone,
  onAddress,
  onNotes,
  onAddMore,
}: {
  cart: CartItem[];
  deliveryType: DeliveryType;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryNotes: string;
  onChangeQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onAddress: (v: string) => void;
  onNotes: (v: string) => void;
  onAddMore: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Carrito */}
      <section className="space-y-2">
        {cart.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 bg-white py-8 text-center text-sm text-zinc-500">
            No hay productos. Volvé y agregá alguno.
          </p>
        ) : (
          cart.map((c) => (
            <div
              key={c._key}
              className="flex items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-zinc-200"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {c.product_name}
                </p>
                {c.modifiers.length > 0 && (
                  <p className="truncate text-xs text-zinc-500">
                    {c.modifiers.map((m) => m.name).join(", ")}
                  </p>
                )}
                {c.notes && (
                  <p className="truncate text-xs italic text-zinc-500">
                    {c.notes}
                  </p>
                )}
                <p className="mt-0.5 text-xs font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(c.line_subtotal_cents)}
                </p>
              </div>
              <div className="flex items-center rounded-full ring-1 ring-zinc-200">
                <button
                  onClick={() => onChangeQty(c._key, -1)}
                  className="flex h-8 w-8 items-center justify-center text-zinc-700 active:bg-zinc-50"
                  aria-label="Menos"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">
                  {c.quantity}
                </span>
                <button
                  onClick={() => onChangeQty(c._key, 1)}
                  className="flex h-8 w-8 items-center justify-center text-zinc-700 active:bg-zinc-50"
                  aria-label="Más"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={() => onRemove(c._key)}
                className="rounded-full p-2 text-zinc-400 active:bg-zinc-100"
                aria-label="Quitar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
        <button
          onClick={onAddMore}
          className="w-full rounded-2xl border border-dashed border-zinc-300 py-2.5 text-sm font-semibold text-zinc-600 active:bg-zinc-50"
        >
          + Agregar más productos
        </button>
      </section>

      {/* Datos del cliente */}
      <section className="space-y-2.5 rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Nombre {deliveryType === "pickup" && "(opcional)"}
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => onName(e.target.value)}
            placeholder="Mostrador"
            className="mt-1 block h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Teléfono {deliveryType === "delivery" ? "(requerido)" : "(opcional)"}
          </label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="11 5555 1234"
            className="mt-1 block h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        {deliveryType === "delivery" && (
          <div>
            <label className="text-xs font-semibold text-zinc-600">
              Dirección de entrega (requerida)
            </label>
            <input
              type="text"
              value={deliveryAddress}
              onChange={(e) => onAddress(e.target.value)}
              placeholder="Av. del Golf 123"
              className="mt-1 block h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Notas (opcional)
          </label>
          <input
            type="text"
            value={deliveryNotes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="ej: sin cebolla, tocar timbre..."
            className="mt-1 block h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </section>
    </div>
  );
}
