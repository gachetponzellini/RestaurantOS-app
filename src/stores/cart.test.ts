import { describe, it, expect } from "vitest";
import {
  cartItemSubtotal,
  cartTotal,
  cartCount,
  type CartItem,
} from "./cart";

const item = (q: number, price: number, mods: number[] = []): CartItem => ({
  id: crypto.randomUUID(),
  product_id: crypto.randomUUID(),
  product_name: "x",
  unit_price_cents: price,
  quantity: q,
  modifiers: mods.map((p) => ({
    modifier_id: crypto.randomUUID(),
    group_id: crypto.randomUUID(),
    name: "m",
    price_delta_cents: p,
  })),
});

// Combo de menú del día con `extra_price_cents` por opción elegida (spec 29).
const dailyMenu = (
  q: number,
  base: number,
  extras: number[],
): CartItem => ({
  id: crypto.randomUUID(),
  kind: "daily_menu",
  daily_menu_id: crypto.randomUUID(),
  product_name: "Combo",
  unit_price_cents: base,
  quantity: q,
  modifiers: [],
  selected_choices: extras.map((extra_price_cents) => ({
    choice_group_id: crypto.randomUUID(),
    choice_group_label: "Bebida",
    product_id: crypto.randomUUID(),
    product_name: "opt",
    extra_price_cents,
    modifiers: [],
  })),
});

describe("cart math", () => {
  it("subtotal includes modifiers times quantity", () => {
    expect(cartItemSubtotal(item(2, 1000, [100, 200]))).toBe(2600);
  });

  it("subtotal with no modifiers", () => {
    expect(cartItemSubtotal(item(3, 500))).toBe(1500);
  });

  it("total sums all items", () => {
    expect(cartTotal([item(1, 1000, [100]), item(2, 500)])).toBe(2100);
  });

  it("count sums quantities", () => {
    expect(cartCount([item(2, 100), item(3, 100), item(1, 100)])).toBe(6);
  });
});

describe("cart math · combo del menú del día (spec 29)", () => {
  it("suma el adicional de la opción elegida al subtotal", () => {
    // base 5000 + cerveza 800 = 5800
    expect(cartItemSubtotal(dailyMenu(1, 5000, [800]))).toBe(5800);
  });

  it("el adicional multiplica por cantidad", () => {
    // (5000 + 800) * 2 = 11600
    expect(cartItemSubtotal(dailyMenu(2, 5000, [800]))).toBe(11600);
  });

  it("una opción incluida ($0) deja el precio base", () => {
    expect(cartItemSubtotal(dailyMenu(1, 5000, [0]))).toBe(5000);
  });

  it("suma adicionales de varios grupos", () => {
    // 5000 + 800 + 500 = 6300
    expect(cartItemSubtotal(dailyMenu(1, 5000, [800, 500]))).toBe(6300);
  });
});
