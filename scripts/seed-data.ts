/**
 * Shared seed data constants and helper functions.
 *
 * Extracted from seed-all.ts so they can be reused by both seed-all.ts and
 * seed-demo.ts without duplicating definitions. This file has NO imports —
 * it is pure data and utility functions.
 */

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickWeighted<T>(items: readonly { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const it of items) { r -= it.weight; if (r <= 0) return it.value; }
  return items[0]!.value;
}

export function minsAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export type CategoryDef = { name: string; default_station: string | null; super_category: string };

export type ProductDef = { name: string; price_cents: number; category: string; station?: string };

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO
// ════════════════════════════════════════════════════════════════════════════

export const STATIONS = [
  { name: "Cocina", sort_order: 0 },
  { name: "Parrilla", sort_order: 1 },
  { name: "Fritera", sort_order: 2 },
  { name: "Postres y Café", sort_order: 3 },
] as const;

export const SUPER_CATEGORIES: { name: string; slug: string; icon: string; color: string }[] = [
  { name: "Bebidas", slug: "bebidas", icon: "glass-water", color: "sky" },
  { name: "Picar y Ensaladas", slug: "picar-y-ensaladas", icon: "salad", color: "lime" },
  { name: "Cafetería", slug: "cafeteria", icon: "coffee", color: "amber" },
  { name: "Entradas y Minutas", slug: "entradas-y-minutas", icon: "utensils-crossed", color: "orange" },
  { name: "Pastas", slug: "pastas", icon: "soup", color: "yellow" },
  { name: "Parrilla", slug: "parrilla", icon: "flame", color: "red" },
  { name: "Pescados", slug: "pescados", icon: "fish", color: "cyan" },
  { name: "Platos", slug: "platos", icon: "chef-hat", color: "violet" },
  { name: "Postres", slug: "postres", icon: "cake-slice", color: "pink" },
  { name: "Vinos", slug: "vinos", icon: "wine", color: "rose" },
];

export const CATEGORIES: CategoryDef[] = [
  { name: "Aguas", default_station: null, super_category: "Bebidas" },
  { name: "Gaseosas", default_station: null, super_category: "Bebidas" },
  { name: "Cervezas", default_station: null, super_category: "Bebidas" },
  { name: "Aperitivos", default_station: null, super_category: "Bebidas" },
  { name: "Whiskys", default_station: null, super_category: "Bebidas" },
  { name: "Espumantes", default_station: null, super_category: "Bebidas" },
  { name: "Sandwich", default_station: null, super_category: "Picar y Ensaladas" },
  { name: "Minutas", default_station: "Cocina", super_category: "Picar y Ensaladas" },
  { name: "Cafetería", default_station: "Postres y Café", super_category: "Cafetería" },
  { name: "Minutas y Fritos", default_station: "Fritera", super_category: "Entradas y Minutas" },
  { name: "Pastas", default_station: "Cocina", super_category: "Pastas" },
  { name: "Parrilla", default_station: "Parrilla", super_category: "Parrilla" },
  { name: "Pescados", default_station: "Cocina", super_category: "Pescados" },
  { name: "Platos", default_station: "Cocina", super_category: "Platos" },
  { name: "Menú", default_station: "Cocina", super_category: "Platos" },
  { name: "Postres", default_station: "Postres y Café", super_category: "Postres" },
  { name: "Kiosko", default_station: null, super_category: "Bebidas" },
  { name: "Vinos", default_station: null, super_category: "Vinos" },
  { name: "Entradas", default_station: "Cocina", super_category: "Entradas y Minutas" },
  { name: "Varios", default_station: null, super_category: "Platos" },
];

export const PRODUCTS: ProductDef[] = [
  // ── Aguas ──
  { name: "Soda", price_cents: 300000, category: "Aguas" },
  { name: "Agua Mineral", price_cents: 300000, category: "Aguas" },
  { name: "Agua Mineral c/Gas", price_cents: 300000, category: "Aguas" },
  { name: "Gatorade", price_cents: 330000, category: "Aguas" },
  { name: "Limonada Soda", price_cents: 800000, category: "Aguas", station: "Postres y Café" },
  { name: "Limonada Agua", price_cents: 800000, category: "Aguas", station: "Postres y Café" },
  // ── Gaseosas ──
  { name: "Gaseosa", price_cents: 350000, category: "Gaseosas" },
  { name: "Descorche", price_cents: 1500000, category: "Gaseosas" },
  { name: "Coca Cola 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Coca Zero 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Sprite 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Sprite Zero 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Fanta 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Fanta Zero 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Aquarius Naranja 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Aquarius Pomelo 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Aquarius Limonada 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Schweppes Pomelo 500ml", price_cents: 300000, category: "Gaseosas" },
  { name: "Schweppes Pomelo Zero 500ml", price_cents: 300000, category: "Gaseosas" },
  // ── Cervezas ──
  { name: "Andes 473cc", price_cents: 450000, category: "Cervezas" },
  { name: "Stella Artois 473cc", price_cents: 550000, category: "Cervezas" },
  { name: "Stella Artois Noire 473cc", price_cents: 590000, category: "Cervezas" },
  { name: "Andes 1lt", price_cents: 750000, category: "Cervezas" },
  { name: "Stella Artois 1lt", price_cents: 850000, category: "Cervezas" },
  { name: "Stella Artois Noire 1lt", price_cents: 850000, category: "Cervezas" },
  // ── Aperitivos ──
  { name: "Fernet", price_cents: 400000, category: "Aperitivos" },
  { name: "Gancia", price_cents: 400000, category: "Aperitivos" },
  { name: "Campari", price_cents: 500000, category: "Aperitivos" },
  { name: "Cynar", price_cents: 400000, category: "Aperitivos" },
  { name: "Cinzano", price_cents: 400000, category: "Aperitivos" },
  { name: "Campari con Naranja", price_cents: 750000, category: "Aperitivos" },
  { name: "Coloradito", price_cents: 750000, category: "Aperitivos" },
  { name: "Negroni", price_cents: 600000, category: "Aperitivos", station: "Postres y Café" },
  { name: "Gin Beefeater", price_cents: 650000, category: "Aperitivos" },
  { name: "Gin", price_cents: 650000, category: "Aperitivos" },
  { name: "Gin Bosque", price_cents: 500000, category: "Aperitivos" },
  { name: "Baileys", price_cents: 200000, category: "Aperitivos" },
  { name: "Gancia Batido", price_cents: 700000, category: "Aperitivos" },
  // ── Whiskys ──
  { name: "Johnny Red Label", price_cents: 950000, category: "Whiskys" },
  { name: "Johnny Black Label", price_cents: 1200000, category: "Whiskys" },
  // ── Espumantes ──
  { name: "Copa Champán", price_cents: 250000, category: "Espumantes" },
  { name: "Las Perdices Espumante", price_cents: 2000000, category: "Espumantes" },
  { name: "Trumpeter Extra Brut", price_cents: 2200000, category: "Espumantes" },
  { name: "Salentein Brut Nature", price_cents: 2450000, category: "Espumantes" },
  { name: "Barón B", price_cents: 5050000, category: "Espumantes" },
  // ── Sandwich ──
  { name: "Bollito Mixto", price_cents: 320000, category: "Sandwich" },
  { name: "Bollito Crudo", price_cents: 400000, category: "Sandwich" },
  { name: "Bollito Primavera", price_cents: 350000, category: "Sandwich" },
  { name: "Traviata Queso", price_cents: 300000, category: "Sandwich" },
  { name: "Traviata Mixta", price_cents: 320000, category: "Sandwich" },
  { name: "Traviata Crudo", price_cents: 400000, category: "Sandwich" },
  { name: "Lactal Mixto", price_cents: 380000, category: "Sandwich" },
  { name: "Lactal Crudo", price_cents: 550000, category: "Sandwich" },
  { name: "Lactal Primavera", price_cents: 550000, category: "Sandwich" },
  { name: "Lactal Atún", price_cents: 400000, category: "Sandwich" },
  { name: "Lactal c/Tomate", price_cents: 450000, category: "Sandwich" },
  { name: "Flauta Mixta", price_cents: 500000, category: "Sandwich" },
  { name: "Flauta Crudo", price_cents: 800000, category: "Sandwich" },
  { name: "Flauta Primavera", price_cents: 700000, category: "Sandwich" },
  { name: "Flauta Primavera de Crudo", price_cents: 900000, category: "Sandwich" },
  { name: "Pebete Primavera", price_cents: 700000, category: "Sandwich" },
  { name: "Pebete Crudo", price_cents: 800000, category: "Sandwich", station: "Cocina" },
  { name: "Miga Crudo", price_cents: 900000, category: "Sandwich" },
  { name: "Bagel", price_cents: 900000, category: "Sandwich", station: "Cocina" },
  { name: "Triple", price_cents: 900000, category: "Sandwich", station: "Cocina" },
  { name: "Familiar Jamón y Queso", price_cents: 500000, category: "Sandwich" },
  { name: "Familiar Crudo", price_cents: 800000, category: "Sandwich" },
  { name: "Familiar Salame", price_cents: 700000, category: "Sandwich" },
  { name: "Familiar Arrollado", price_cents: 950000, category: "Sandwich" },
  { name: "Familiar Milanesa", price_cents: 1000000, category: "Sandwich", station: "Cocina" },
  { name: "Familiar Milanesa J y Q", price_cents: 1200000, category: "Sandwich", station: "Cocina" },
  { name: "Familiar Milanesa Especial", price_cents: 1400000, category: "Sandwich", station: "Cocina" },
  { name: "Familiar Milanesa Especial c/H", price_cents: 1500000, category: "Sandwich", station: "Cocina" },
  { name: "Tostado Mixto", price_cents: 700000, category: "Sandwich", station: "Cocina" },
  { name: "Tostado c/Tomate", price_cents: 800000, category: "Sandwich", station: "Cocina" },
  { name: "Tostadas", price_cents: 400000, category: "Sandwich", station: "Cocina" },
  { name: "Lomito Simple", price_cents: 1500000, category: "Sandwich", station: "Parrilla" },
  { name: "Lomito Jamón y Queso", price_cents: 1800000, category: "Sandwich", station: "Parrilla" },
  { name: "Lomito Especial", price_cents: 2000000, category: "Sandwich", station: "Parrilla" },
  { name: "Lomito Especial con Huevo", price_cents: 2200000, category: "Sandwich", station: "Parrilla" },
  { name: "Choripán", price_cents: 400000, category: "Sandwich", station: "Parrilla" },
  { name: "Tarta", price_cents: 850000, category: "Sandwich" },
  // ── Minutas ──
  { name: "Queso", price_cents: 450000, category: "Minutas", station: "Cocina" },
  { name: "Jamón Crudo", price_cents: 1400000, category: "Minutas", station: "Cocina" },
  { name: "Jamón Cocido", price_cents: 250000, category: "Minutas" },
  { name: "Salame", price_cents: 500000, category: "Minutas", station: "Cocina" },
  { name: "Queso Oliva y Pimienta", price_cents: 550000, category: "Minutas", station: "Cocina" },
  { name: "Aceituna", price_cents: 300000, category: "Minutas", station: "Cocina" },
  { name: "Maní", price_cents: 300000, category: "Minutas", station: "Cocina" },
  { name: "Arrollado", price_cents: 950000, category: "Minutas" },
  { name: "Papas Copetín", price_cents: 450000, category: "Minutas", station: "Cocina" },
  // ── Cafetería ──
  { name: "Café", price_cents: 250000, category: "Cafetería", station: "Postres y Café" },
  { name: "Café Jarrita", price_cents: 300000, category: "Cafetería", station: "Postres y Café" },
  { name: "Cortado", price_cents: 250000, category: "Cafetería", station: "Postres y Café" },
  { name: "Cortado Jarrita", price_cents: 300000, category: "Cafetería", station: "Postres y Café" },
  { name: "Lágrima", price_cents: 250000, category: "Cafetería", station: "Postres y Café" },
  { name: "Lágrima Jarrita", price_cents: 300000, category: "Cafetería", station: "Postres y Café" },
  { name: "Té", price_cents: 300000, category: "Cafetería", station: "Postres y Café" },
  { name: "Espumita de Limón", price_cents: 160000, category: "Cafetería" },
  { name: "Torta Alemana", price_cents: 1000000, category: "Cafetería", station: "Postres y Café" },
  { name: "Torta Bar", price_cents: 800000, category: "Cafetería" },
  { name: "Mini Torta", price_cents: 500000, category: "Cafetería" },
  { name: "Invertida de Manzana", price_cents: 350000, category: "Cafetería" },
  { name: "Budín", price_cents: 350000, category: "Cafetería" },
  { name: "Santafesino", price_cents: 350000, category: "Cafetería" },
  { name: "Alfajor Artesanal", price_cents: 350000, category: "Cafetería" },
  { name: "Vienesas", price_cents: 200000, category: "Cafetería" },
  // ── Minutas y Fritos ──
  { name: "Papas Fritas", price_cents: 850000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Papas c/Crema", price_cents: 1200000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Papas Provenzal", price_cents: 1100000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Papas Rejilla", price_cents: 950000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Papas Española", price_cents: 850000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Papas Gratinadas", price_cents: 1500000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Papas a Caballo", price_cents: 1100000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Puré", price_cents: 800000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Puré de Manzana", price_cents: 600000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Papa Natural", price_cents: 200000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Espinaca Gratén", price_cents: 1600000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Rabas", price_cents: 1800000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Provoleta", price_cents: 1200000, category: "Minutas y Fritos", station: "Parrilla" },
  { name: "Provoleta Especial", price_cents: 1600000, category: "Minutas y Fritos", station: "Parrilla" },
  { name: "Omelette", price_cents: 1100000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Omelette Caprese", price_cents: 1200000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Omelette Espinacas y Queso Azul", price_cents: 1200000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Omelette Verdura", price_cents: 850000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Tortilla Papas", price_cents: 1400000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Tortilla c/Camarones", price_cents: 2500000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Tortilla Espinaca", price_cents: 1600000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Ensalada 1 Gusto", price_cents: 380000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada 2 Gustos", price_cents: 500000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada Completa", price_cents: 600000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada con Parmesano", price_cents: 700000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada con Parmesano y Aceitunas Negras", price_cents: 850000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada Caprese", price_cents: 1200000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada Rusa", price_cents: 650000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada Pollo Rebozado", price_cents: 2200000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada Queso Azul", price_cents: 2400000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Ensalada Tibia", price_cents: 750000, category: "Minutas y Fritos", station: "Parrilla" },
  { name: "Vithel Tonné", price_cents: 1600000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Arrollado Casero", price_cents: 1550000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Milanesa Entrecot", price_cents: 2400000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Milanesa Entrecot Napolitana", price_cents: 2850000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Milanesa Sugerencia", price_cents: 2800000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Huevo", price_cents: 200000, category: "Minutas y Fritos", station: "Fritera" },
  { name: "Tomate al Medio", price_cents: 120000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Sopa", price_cents: 500000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Manteca Porción", price_cents: 250000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Roquefort Porción", price_cents: 600000, category: "Minutas y Fritos", station: "Cocina" },
  { name: "Adicional Menú", price_cents: 400000, category: "Minutas y Fritos", station: "Cocina" },
  // ── Pastas ──
  { name: "Ñoquis", price_cents: 1600000, category: "Pastas", station: "Cocina" },
  { name: "Tallarines", price_cents: 1600000, category: "Pastas", station: "Cocina" },
  { name: "Ravioles", price_cents: 1800000, category: "Pastas", station: "Cocina" },
  { name: "Sorrentinos Jamón y Queso", price_cents: 2200000, category: "Pastas", station: "Cocina" },
  { name: "Sorrentinos Calabaza", price_cents: 2200000, category: "Pastas", station: "Cocina" },
  { name: "Sorrentinos Salmón c/Tinta", price_cents: 2500000, category: "Pastas", station: "Cocina" },
  { name: "Crepes de Verdura", price_cents: 1800000, category: "Pastas", station: "Cocina" },
  { name: "Lasagna", price_cents: 2200000, category: "Pastas", station: "Cocina" },
  { name: "Pasta Sugerencia", price_cents: 2200000, category: "Pastas", station: "Cocina" },
  { name: "Pasta Sugerencia Deli", price_cents: 2100000, category: "Pastas", station: "Cocina" },
  { name: "Bolognesa", price_cents: 400000, category: "Pastas", station: "Cocina" },
  { name: "Cuatro Quesos", price_cents: 450000, category: "Pastas", station: "Cocina" },
  { name: "Pesto", price_cents: 450000, category: "Pastas", station: "Cocina" },
  { name: "Mediterránea", price_cents: 500000, category: "Pastas", station: "Cocina" },
  { name: "Parisien", price_cents: 550000, category: "Pastas", station: "Cocina" },
  { name: "Gratén (salsa)", price_cents: 550000, category: "Pastas", station: "Cocina" },
  { name: "Bagnacauda", price_cents: 450000, category: "Pastas", station: "Cocina" },
  { name: "Caruso", price_cents: 450000, category: "Pastas", station: "Cocina" },
  { name: "Carbonara", price_cents: 500000, category: "Pastas", station: "Cocina" },
  { name: "Pomarola c/Langostinos", price_cents: 1450000, category: "Pastas", station: "Cocina" },
  // ── Parrilla ──
  { name: "Entrecot", price_cents: 2400000, category: "Parrilla", station: "Parrilla" },
  { name: "Lomo", price_cents: 2800000, category: "Parrilla", station: "Parrilla" },
  { name: "Petit Lomo", price_cents: 1700000, category: "Parrilla", station: "Parrilla" },
  { name: "Ojo de Bife", price_cents: 2900000, category: "Parrilla", station: "Parrilla" },
  { name: "Matambrito", price_cents: 2300000, category: "Parrilla", station: "Parrilla" },
  { name: "Asado de Tira", price_cents: 3700000, category: "Parrilla", station: "Parrilla" },
  { name: "Angus", price_cents: 3300000, category: "Parrilla", station: "Parrilla" },
  { name: "Brochette de Lomo", price_cents: 2900000, category: "Parrilla", station: "Parrilla" },
  { name: "Brochette de Pollo", price_cents: 2300000, category: "Parrilla", station: "Parrilla" },
  { name: "Entraña", price_cents: 2200000, category: "Parrilla", station: "Parrilla" },
  { name: "Chorizo", price_cents: 400000, category: "Parrilla", station: "Parrilla" },
  { name: "Morcilla", price_cents: 300000, category: "Parrilla", station: "Parrilla" },
  { name: "Molleja", price_cents: 1850000, category: "Parrilla", station: "Parrilla" },
  { name: "Chinchulines", price_cents: 950000, category: "Parrilla", station: "Parrilla" },
  { name: "Dorado", price_cents: 2000000, category: "Parrilla", station: "Parrilla" },
  { name: "Pacú Grillado", price_cents: 2500000, category: "Parrilla", station: "Parrilla" },
  { name: "Costeleton", price_cents: 1450000, category: "Parrilla", station: "Parrilla" },
  { name: "Costeleton Deli", price_cents: 900000, category: "Parrilla", station: "Parrilla" },
  { name: "Provoleta Sugerencia", price_cents: 970000, category: "Parrilla", station: "Cocina" },
  // ── Pescados ──
  { name: "Salmón Grillé", price_cents: 3200000, category: "Pescados", station: "Parrilla" },
  { name: "Salmón Especial", price_cents: 3800000, category: "Pescados", station: "Cocina" },
  { name: "Salmón Crema Camarones", price_cents: 3800000, category: "Pescados", station: "Cocina" },
  { name: "Salmón Sugerencia", price_cents: 3800000, category: "Pescados", station: "Cocina" },
  { name: "Salmón Crema Limón", price_cents: 3800000, category: "Pescados", station: "Cocina" },
  { name: "Calamaretes a la Leonesa", price_cents: 3200000, category: "Pescados", station: "Cocina" },
  { name: "Calamaretes Parmesano", price_cents: 2700000, category: "Pescados", station: "Fritera" },
  { name: "Calamaretes Grillados", price_cents: 2700000, category: "Pescados", station: "Cocina" },
  { name: "Langostinos", price_cents: 2400000, category: "Pescados", station: "Fritera" },
  { name: "Abadejo Sugerencia", price_cents: 2800000, category: "Pescados", station: "Cocina" },
  { name: "Merluza Sugerencia", price_cents: 2000000, category: "Pescados", station: "Cocina" },
  { name: "Boga Despinada", price_cents: 2000000, category: "Pescados", station: "Parrilla" },
  // ── Platos ──
  { name: "Milanesa", price_cents: 1800000, category: "Platos", station: "Fritera" },
  { name: "Milanesa Napolitana", price_cents: 2250000, category: "Platos", station: "Fritera" },
  { name: "Milanesa Florentina", price_cents: 1700000, category: "Platos", station: "Fritera" },
  { name: "Suprema", price_cents: 1500000, category: "Platos", station: "Fritera" },
  { name: "Suprema Napolitana", price_cents: 1900000, category: "Platos", station: "Fritera" },
  { name: "Revuelto Gramajo", price_cents: 1900000, category: "Platos", station: "Fritera" },
  { name: "Merluza Romana", price_cents: 1700000, category: "Platos", station: "Fritera" },
  { name: "Petit Entrecot", price_cents: 1800000, category: "Platos", station: "Parrilla" },
  { name: "Filet de Pollo", price_cents: 1900000, category: "Platos", station: "Parrilla" },
  { name: "Costillas Barbacoa", price_cents: 2800000, category: "Platos", station: "Parrilla" },
  { name: "Lomo Reducción", price_cents: 3450000, category: "Platos", station: "Cocina" },
  { name: "Lomo Relleno", price_cents: 3450000, category: "Platos", station: "Cocina" },
  { name: "Lomo Sugerencia", price_cents: 3400000, category: "Platos", station: "Cocina" },
  { name: "Entrecot Especial", price_cents: 3250000, category: "Platos", station: "Cocina" },
  { name: "Ojo de Bife Sugerencia", price_cents: 3300000, category: "Platos", station: "Parrilla" },
  { name: "Matambrito Pizza", price_cents: 3300000, category: "Platos", station: "Cocina" },
  { name: "Matambrito Roquefort Nueces", price_cents: 2800000, category: "Platos", station: "Cocina" },
  { name: "Matambrito Sugerencia", price_cents: 2800000, category: "Platos", station: "Parrilla" },
  { name: "Osobuco Braseado", price_cents: 2300000, category: "Platos", station: "Cocina" },
  { name: "Solomillo Especial", price_cents: 2600000, category: "Platos", station: "Cocina" },
  { name: "Solomillo Sugerencia", price_cents: 2800000, category: "Platos", station: "Cocina" },
  { name: "Bondiola Sugerencia", price_cents: 2500000, category: "Platos", station: "Cocina" },
  { name: "Pollo Especial", price_cents: 2600000, category: "Platos", station: "Cocina" },
  { name: "Pollo Sugerencia", price_cents: 2600000, category: "Platos", station: "Cocina" },
  { name: "Salteado Molleja Verdeo", price_cents: 3250000, category: "Platos", station: "Cocina" },
  { name: "Espinaca Salteada", price_cents: 950000, category: "Platos", station: "Cocina" },
  { name: "Locro", price_cents: 2300000, category: "Platos", station: "Cocina" },
  { name: "Guiso", price_cents: 1900000, category: "Platos", station: "Cocina" },
  { name: "Mondongo", price_cents: 850000, category: "Platos", station: "Cocina" },
  { name: "Strogonoff", price_cents: 830000, category: "Platos", station: "Cocina" },
  { name: "Saltimbocca", price_cents: 1200000, category: "Platos", station: "Cocina" },
  { name: "Chop Suey", price_cents: 2800000, category: "Platos", station: "Cocina" },
  { name: "Langostinos Sugerencia", price_cents: 2600000, category: "Platos", station: "Cocina" },
  { name: "Ensalada Sugerencia", price_cents: 2700000, category: "Platos", station: "Cocina" },
  { name: "Ragú Sugerencia", price_cents: 2200000, category: "Platos", station: "Cocina" },
  { name: "Carré Sugerencia", price_cents: 2400000, category: "Platos", station: "Cocina" },
  { name: "Costeletas Sugerencia", price_cents: 2000000, category: "Platos", station: "Cocina" },
  { name: "Sugerencia Menú 2", price_cents: 1000000, category: "Platos", station: "Cocina" },
  // ── Menú ──
  { name: "Menú", price_cents: 3500000, category: "Menú", station: "Cocina" },
  { name: "Menú Jugadores", price_cents: 2500000, category: "Menú" },
  { name: "Menú Milanesa", price_cents: 2100000, category: "Menú", station: "Fritera" },
  { name: "Menú Pasta", price_cents: 1400000, category: "Menú", station: "Cocina" },
  { name: "Menú Médicos Go", price_cents: 1200000, category: "Menú", station: "Cocina" },
  // ── Postres ──
  { name: "Helado Simple", price_cents: 450000, category: "Postres", station: "Postres y Café" },
  { name: "Helado Doble", price_cents: 600000, category: "Postres", station: "Postres y Café" },
  { name: "Helado Especial", price_cents: 550000, category: "Postres", station: "Postres y Café" },
  { name: "Helado Especial Doble", price_cents: 750000, category: "Postres", station: "Postres y Café" },
  { name: "Helado Sambayón", price_cents: 550000, category: "Postres", station: "Postres y Café" },
  { name: "Bombón Escocés", price_cents: 400000, category: "Postres", station: "Postres y Café" },
  { name: "Bombón Suizo", price_cents: 400000, category: "Postres", station: "Postres y Café" },
  { name: "Almendrado", price_cents: 400000, category: "Postres", station: "Postres y Café" },
  { name: "Ensalada de Frutas", price_cents: 500000, category: "Postres", station: "Postres y Café" },
  { name: "Flan", price_cents: 700000, category: "Postres", station: "Postres y Café" },
  { name: "Macedonia", price_cents: 800000, category: "Postres", station: "Postres y Café" },
  { name: "Tiramisú", price_cents: 1000000, category: "Postres", station: "Postres y Café" },
  { name: "Mousse de Chocolate", price_cents: 1000000, category: "Postres", station: "Postres y Café" },
  { name: "Mousse de Naranja", price_cents: 1000000, category: "Postres", station: "Postres y Café" },
  { name: "Cheesecake", price_cents: 800000, category: "Postres", station: "Postres y Café" },
  { name: "Panqueques Dulce de Leche", price_cents: 900000, category: "Postres", station: "Postres y Café" },
  { name: "Pera al Vino", price_cents: 900000, category: "Postres", station: "Postres y Café" },
  { name: "Queso y Dulce", price_cents: 1500000, category: "Postres", station: "Postres y Café" },
  { name: "Don Pedro", price_cents: 1200000, category: "Postres", station: "Postres y Café" },
  { name: "Sambayón Batido", price_cents: 1400000, category: "Postres", station: "Cocina" },
  { name: "Tortilla de Manzana", price_cents: 1800000, category: "Postres", station: "Cocina" },
  { name: "Tortilla Normanda", price_cents: 2600000, category: "Postres", station: "Cocina" },
  { name: "Frutillas c/Crema", price_cents: 700000, category: "Postres", station: "Postres y Café" },
  { name: "Brownie c/Helado", price_cents: 800000, category: "Postres", station: "Postres y Café" },
  { name: "Isla Flotante", price_cents: 400000, category: "Postres", station: "Postres y Café" },
  { name: "Torta", price_cents: 1000000, category: "Postres", station: "Postres y Café" },
  { name: "Torta Postre C", price_cents: 1000000, category: "Postres", station: "Postres y Café" },
  { name: "Lemon Champán", price_cents: 700000, category: "Postres", station: "Postres y Café" },
  { name: "Crumble de Manzana", price_cents: 800000, category: "Postres", station: "Postres y Café" },
  { name: "Pavlova", price_cents: 600000, category: "Postres", station: "Postres y Café" },
  // ── Kiosko ──
  { name: "Citric", price_cents: 330000, category: "Kiosko" },
  { name: "Citric 500cc", price_cents: 330000, category: "Kiosko" },
  { name: "Citric 250cc", price_cents: 250000, category: "Kiosko" },
  { name: "Cindor", price_cents: 200000, category: "Kiosko" },
  { name: "Yogur Bebible", price_cents: 250000, category: "Kiosko" },
  { name: "Cepita Botella", price_cents: 200000, category: "Kiosko" },
  { name: "Chocolate Alpino", price_cents: 350000, category: "Kiosko" },
  { name: "Alfajor Terrabusi", price_cents: 200000, category: "Kiosko" },
  { name: "Alfajor Fantoche", price_cents: 150000, category: "Kiosko" },
  { name: "Alfajor Frank", price_cents: 300000, category: "Kiosko" },
  { name: "Alfajor Milka", price_cents: 200000, category: "Kiosko" },
  { name: "Cachafaz", price_cents: 260000, category: "Kiosko" },
  { name: "Cookies", price_cents: 300000, category: "Kiosko" },
  { name: "Maicena", price_cents: 300000, category: "Kiosko" },
  { name: "Copito", price_cents: 250000, category: "Kiosko" },
  { name: "Mini Rogel", price_cents: 250000, category: "Kiosko" },
  { name: "Kinder", price_cents: 200000, category: "Kiosko" },
  { name: "Milka", price_cents: 250000, category: "Kiosko" },
  { name: "Rhodesia", price_cents: 100000, category: "Kiosko" },
  { name: "Tita", price_cents: 100000, category: "Kiosko" },
  { name: "Barrita Cereal", price_cents: 230000, category: "Kiosko" },
  { name: "Turrón", price_cents: 100000, category: "Kiosko" },
  { name: "Mix Frutos", price_cents: 250000, category: "Kiosko" },
  { name: "Chicle", price_cents: 150000, category: "Kiosko" },
  { name: "Pastillas", price_cents: 150000, category: "Kiosko" },
  { name: "Muecas", price_cents: 230000, category: "Kiosko" },
  { name: "Banana", price_cents: 130000, category: "Kiosko" },
  { name: "Shot", price_cents: 250000, category: "Kiosko" },
  { name: "Chocolate", price_cents: 150000, category: "Kiosko" },
  // ── Vinos ──
  { name: "Copa de Vino Tinto", price_cents: 400000, category: "Vinos" },
  { name: "Copa de Vino Blanco", price_cents: 400000, category: "Vinos" },
  { name: "Crios Malbec", price_cents: 1100000, category: "Vinos" },
  { name: "Crios Chardonnay", price_cents: 1100000, category: "Vinos" },
  { name: "Crios Rosé of Malbec", price_cents: 1100000, category: "Vinos" },
  { name: "Amalaya Malbec", price_cents: 1300000, category: "Vinos" },
  { name: "Amalaya Torrontés", price_cents: 1250000, category: "Vinos" },
  { name: "Amalaya Corte de Origen", price_cents: 1800000, category: "Vinos" },
  { name: "Amalaya Gran Corte", price_cents: 2250000, category: "Vinos" },
  { name: "Amalaya Corte Único", price_cents: 3900000, category: "Vinos" },
  { name: "Punto Final", price_cents: 1400000, category: "Vinos" },
  { name: "Punto Final Reserva", price_cents: 2200000, category: "Vinos" },
  { name: "Las Perdices Malbec", price_cents: 1500000, category: "Vinos" },
  { name: "Las Perdices Reserva", price_cents: 2100000, category: "Vinos" },
  { name: "Las Perdices Reserva 1/3", price_cents: 1350000, category: "Vinos" },
  { name: "Las Perdices 1/3", price_cents: 1090000, category: "Vinos" },
  { name: "Las Perdices Red Blend", price_cents: 1600000, category: "Vinos" },
  { name: "Las Perdices Sauvignon Blanc", price_cents: 1600000, category: "Vinos" },
  { name: "Las Perdices Pinot Noir", price_cents: 2300000, category: "Vinos" },
  { name: "Las Perdices Don Juan", price_cents: 3750000, category: "Vinos" },
  { name: "Las Perdices Exploracion Rosé", price_cents: 2650000, category: "Vinos" },
  { name: "Trumpeter", price_cents: 1450000, category: "Vinos" },
  { name: "Trumpeter Reserve", price_cents: 1950000, category: "Vinos" },
  { name: "Trumpeter Sauvignon Blanc", price_cents: 1450000, category: "Vinos" },
  { name: "Trumpeter Reserve Rosé", price_cents: 1750000, category: "Vinos" },
  { name: "Saint Felicien Malbec", price_cents: 2000000, category: "Vinos" },
  { name: "Saint Felicien Cabernet Franc", price_cents: 2200000, category: "Vinos" },
  { name: "Salentein Reserva", price_cents: 1900000, category: "Vinos" },
  { name: "Salentein Reserva Sauvignon Blanc", price_cents: 1850000, category: "Vinos" },
  { name: "Salentein Numina", price_cents: 3000000, category: "Vinos" },
  { name: "Salentein Numina Chardonnay", price_cents: 3000000, category: "Vinos" },
  { name: "Salentein Numina Pinot Noir", price_cents: 2900000, category: "Vinos" },
  { name: "Cuvelier Malbec", price_cents: 2800000, category: "Vinos" },
  { name: "Cuvelier Merlot", price_cents: 2800000, category: "Vinos" },
  { name: "Cuvelier Cabernet Sauvignon", price_cents: 2800000, category: "Vinos" },
  { name: "Cuvelier Colección", price_cents: 3300000, category: "Vinos" },
  { name: "Rutini Malbec", price_cents: 3800000, category: "Vinos" },
  { name: "Rutini Cabernet Franc", price_cents: 3400000, category: "Vinos" },
  { name: "Rutini Cabernet", price_cents: 2500000, category: "Vinos" },
  { name: "Rutini Chardonnay", price_cents: 3250000, category: "Vinos" },
  { name: "Rutini Sauvignon Blanc", price_cents: 2500000, category: "Vinos" },
  { name: "Rutini 1/3", price_cents: 1400000, category: "Vinos" },
  { name: "DV Catena Malbec", price_cents: 3900000, category: "Vinos" },
  { name: "DV Catena Cabernet", price_cents: 3050000, category: "Vinos" },
  { name: "DV Catena Chardonnay", price_cents: 2700000, category: "Vinos" },
  { name: "Angelica Zapata Alta", price_cents: 4000000, category: "Vinos" },
  { name: "Colomé Estate Malbec", price_cents: 2600000, category: "Vinos" },
  { name: "Nicasia", price_cents: 1950000, category: "Vinos" },
  { name: "Killka Blend", price_cents: 1600000, category: "Vinos" },
  { name: "Uno Antigal", price_cents: 1700000, category: "Vinos" },
  { name: "Puramun Reserva Malbec", price_cents: 2400000, category: "Vinos" },
  { name: "Puramun Cofermentado", price_cents: 2400000, category: "Vinos" },
  { name: "Clos de los 7", price_cents: 2750000, category: "Vinos" },
  { name: "Milamore", price_cents: 3600000, category: "Vinos" },
  { name: "Legado Dante Robino", price_cents: 3600000, category: "Vinos" },
  { name: "Gran Dante", price_cents: 4800000, category: "Vinos" },
  { name: "Yacochuya Torrontés", price_cents: 1500000, category: "Vinos" },
  { name: "Yacochuya", price_cents: 2700000, category: "Vinos" },
  { name: "Jockey Joven", price_cents: 1600000, category: "Vinos" },
  { name: "Jockey Reserva", price_cents: 2200000, category: "Vinos" },
  { name: "Doña Paula", price_cents: 330000, category: "Vinos" },
  { name: "La Anita", price_cents: 620000, category: "Vinos" },
  { name: "Petite Fleur", price_cents: 830000, category: "Vinos" },
  // ── Entradas ──
  { name: "Empanada Carne", price_cents: 350000, category: "Entradas", station: "Fritera" },
  { name: "Empanada Cuchillo", price_cents: 350000, category: "Entradas", station: "Fritera" },
  { name: "Empanada Jamón y Queso", price_cents: 300000, category: "Entradas", station: "Fritera" },
  { name: "Empanada Pescado", price_cents: 200000, category: "Entradas", station: "Cocina" },
  { name: "Empanada Verdura", price_cents: 190000, category: "Entradas", station: "Cocina" },
  { name: "Porción Manteca", price_cents: 300000, category: "Entradas", station: "Cocina" },
  // ── Varios ──
  { name: "Arroz con Mariscos", price_cents: 2500000, category: "Varios", station: "Cocina" },
  { name: "Risotto Sugerencia", price_cents: 2200000, category: "Varios", station: "Cocina" },
  { name: "Cazuela", price_cents: 2200000, category: "Varios", station: "Cocina" },
  { name: "Wok Sugerencia", price_cents: 2000000, category: "Varios", station: "Cocina" },
  { name: "Pastel de Papas", price_cents: 1700000, category: "Varios", station: "Cocina" },
  { name: "Brochette Sugerencia", price_cents: 2800000, category: "Varios", station: "Parrilla" },
  { name: "Dorado Sugerencia", price_cents: 2100000, category: "Varios", station: "Parrilla" },
  { name: "Entraña Sugerencia", price_cents: 2800000, category: "Varios", station: "Parrilla" },
  { name: "Entrecot Sugerencia", price_cents: 3200000, category: "Varios", station: "Parrilla" },
  { name: "Boga Sugerencia", price_cents: 3000000, category: "Varios", station: "Parrilla" },
  { name: "Churrasquito Sugerencia", price_cents: 2600000, category: "Varios", station: "Parrilla" },
  { name: "Pacú Sugerencia", price_cents: 2800000, category: "Varios", station: "Parrilla" },
  { name: "Pescado Sugerencia", price_cents: 3200000, category: "Varios", station: "Cocina" },
  { name: "Marineras Sugerencia", price_cents: 3000000, category: "Varios", station: "Cocina" },
  { name: "Trucha Sugerencia", price_cents: 2800000, category: "Varios", station: "Cocina" },
  { name: "Suprema Sugerencia", price_cents: 1400000, category: "Varios", station: "Cocina" },
  { name: "Escalope Sugerencia", price_cents: 1800000, category: "Varios", station: "Cocina" },
  { name: "Calamar Relleno", price_cents: 420000, category: "Varios", station: "Cocina" },
  { name: "Calamaretes Sugerencia", price_cents: 1200000, category: "Varios", station: "Cocina" },
  { name: "Colita de Cuadril Sugerencia", price_cents: 2800000, category: "Varios", station: "Cocina" },
  { name: "Bife Sugerencia", price_cents: 2200000, category: "Varios", station: "Cocina" },
  { name: "Crepe Sugerencia", price_cents: 1800000, category: "Varios", station: "Cocina" },
  { name: "Torta Restaurant", price_cents: 6500000, category: "Varios" },
  { name: "Limonada con Gaseosa", price_cents: 1200000, category: "Varios", station: "Postres y Café" },
  { name: "Aperol", price_cents: 600000, category: "Varios", station: "Postres y Café" },
  { name: "Corona", price_cents: 600000, category: "Varios" },
  { name: "Amalaya Espumante", price_cents: 1800000, category: "Varios" },
];

// ════════════════════════════════════════════════════════════════════════════
// INFRAESTRUCTURA FÍSICA
// ════════════════════════════════════════════════════════════════════════════

export const SALON_TABLES = [
  { label: "1", seats: 2, shape: "circle", x: 100, y: 100, width: 80, height: 80 },
  { label: "2", seats: 2, shape: "circle", x: 250, y: 100, width: 80, height: 80 },
  { label: "3", seats: 4, shape: "square", x: 400, y: 100, width: 100, height: 100 },
  { label: "4", seats: 4, shape: "square", x: 550, y: 100, width: 100, height: 100 },
  { label: "5", seats: 4, shape: "square", x: 700, y: 100, width: 100, height: 100 },
  { label: "6", seats: 6, shape: "rect", x: 100, y: 280, width: 180, height: 100 },
  { label: "7", seats: 6, shape: "rect", x: 350, y: 280, width: 180, height: 100 },
  { label: "8", seats: 6, shape: "rect", x: 600, y: 280, width: 180, height: 100 },
  { label: "9", seats: 8, shape: "rect", x: 100, y: 450, width: 220, height: 120 },
  { label: "10", seats: 8, shape: "rect", x: 400, y: 450, width: 220, height: 120 },
  { label: "11", seats: 4, shape: "circle", x: 700, y: 470, width: 100, height: 100 },
  { label: "12", seats: 2, shape: "circle", x: 850, y: 470, width: 80, height: 80 },
];

export const TERRAZA_TABLES = [
  { label: "T1", seats: 4, shape: "circle", x: 100, y: 100, width: 90, height: 90 },
  { label: "T2", seats: 4, shape: "circle", x: 250, y: 100, width: 90, height: 90 },
  { label: "T3", seats: 6, shape: "rect", x: 400, y: 100, width: 180, height: 100 },
  { label: "T4", seats: 2, shape: "circle", x: 100, y: 280, width: 80, height: 80 },
  { label: "T5", seats: 2, shape: "circle", x: 250, y: 280, width: 80, height: 80 },
  { label: "T6", seats: 8, shape: "rect", x: 400, y: 280, width: 220, height: 120 },
];

export const RESERVATION_SCHEDULE: Record<string, { open: boolean; slots: string[] }> = {
  "0": { open: true, slots: ["12:00", "13:00", "13:30", "20:30", "21:00", "21:30"] },
  "1": { open: false, slots: [] },
  "2": { open: true, slots: ["12:00", "13:00", "13:30", "20:30", "21:00", "21:30"] },
  "3": { open: true, slots: ["12:00", "13:00", "13:30", "20:30", "21:00", "21:30"] },
  "4": { open: true, slots: ["12:00", "13:00", "13:30", "20:30", "21:00", "21:30", "22:00"] },
  "5": { open: true, slots: ["12:00", "13:00", "13:30", "20:30", "21:00", "21:30", "22:00"] },
  "6": { open: true, slots: ["12:00", "13:00", "13:30", "20:30", "21:00", "21:30", "22:00"] },
};

// ════════════════════════════════════════════════════════════════════════════
// EQUIPO
// ════════════════════════════════════════════════════════════════════════════

export const TEAM = [
  { email: "admin@demo.test", name: "Carlos Admin", role: "admin", pin: null },
  { email: "sofia@demo.test", name: "Sofía Encargada", role: "encargado", pin: "1234" },
  { email: "pedro@demo.test", name: "Pedro Mozo", role: "mozo", pin: "1111" },
  { email: "lucia@demo.test", name: "Lucía Moza", role: "mozo", pin: "2222" },
  { email: "diego@demo.test", name: "Diego Mozo", role: "mozo", pin: "3333" },
  { email: "ramon@demo.test", name: "Ramón Cocina", role: "personal", pin: "4444" },
  { email: "marta@demo.test", name: "Marta Limpieza", role: "personal", pin: "5555" },
] as const;

export const TEAM_PASSWORD = "demo1234";

// ════════════════════════════════════════════════════════════════════════════
// HISTORIAL
// ════════════════════════════════════════════════════════════════════════════

export const FIRST_NAMES = [
  "María", "Juan", "Laura", "Diego", "Sofía", "Martín", "Carolina", "Pablo",
  "Florencia", "Sebastián", "Valentina", "Mateo", "Camila", "Lucas", "Agustina",
];

export const LAST_NAMES = [
  "González", "Rodríguez", "Fernández", "López", "Martínez", "García",
  "Pérez", "Sánchez", "Romero", "Sosa", "Díaz", "Torres", "Gómez", "Álvarez",
  "Ruiz",
];

export const STREETS = [
  "Pellegrini", "Córdoba", "Rioja", "San Lorenzo", "Mendoza", "San Juan",
  "Salta", "Entre Ríos", "Sarmiento", "Mitre",
];

export const RESERVATION_NOTES = [
  null, null, null,
  "Cumpleaños", "Mesa cerca de la ventana si es posible", "Aniversario",
  "Vienen con un bebé, traer silla alta", "Un comensal celíaco",
  "Reunión de trabajo", "Mesa tranquila si se puede",
];
