// @ts-nocheck
/**
 * rdg-menu.ts — Menú REAL de Restaurante del Golf (JCR Golf), transcripto tal cual
 * desde https://restaurantedelgolf.menufacil.ar/restaurante/ (2026-07-05).
 *
 * Precios en PESOS (enteros) — el loader los pasa a centavos (×100).
 * Estructura de 2 niveles del catálogo de RestaurantOS:
 *   super_category → category → product
 * Las sub-divisiones de vinos (Malbec, Cabernet, etc.) van en `desc` porque el
 * modelo no tiene 3 niveles.
 *
 * Consumido por load-rdg-menu.ts (upsert idempotente por slug, no destructivo).
 */

export const RDG_SUPER_CATEGORIES = [
  { slug: "cocina", name: "Cocina", sort: 1 },
  { slug: "parrilla", name: "Parrilla", sort: 2 },
  { slug: "postres", name: "Postres", sort: 3 },
  { slug: "bebidas", name: "Bebidas", sort: 4 },
  { slug: "vinos", name: "Vinos", sort: 5 },
];

// category slug → super_category slug
export const RDG_CATEGORIES = [
  { slug: "entradas", name: "Entradas", super: "cocina", sort: 1 },
  { slug: "ensaladas", name: "Ensaladas", super: "cocina", sort: 2 },
  { slug: "menu-infantil", name: "Menú Infantil", super: "cocina", sort: 3 },
  { slug: "pastas", name: "Pastas", super: "cocina", sort: 4 },
  { slug: "salsas", name: "Salsas", super: "cocina", sort: 5 },
  { slug: "minutas", name: "Minutas", super: "cocina", sort: 6 },
  { slug: "guarniciones", name: "Guarniciones", super: "cocina", sort: 7 },
  { slug: "nuestra-cocina", name: "Nuestra Cocina", super: "cocina", sort: 8 },
  { slug: "nuestra-parrilla", name: "Nuestra Parrilla", super: "parrilla", sort: 1 },
  { slug: "postres", name: "Postres", super: "postres", sort: 1 },
  { slug: "sin-alcohol", name: "Sin Alcohol", super: "bebidas", sort: 1 },
  { slug: "cervezas", name: "Cervezas", super: "bebidas", sort: 2 },
  { slug: "vinos-tintos", name: "Vinos Tintos", super: "vinos", sort: 1 },
  { slug: "vinos-blancos", name: "Vinos Blancos", super: "vinos", sort: 2 },
  { slug: "rosados", name: "Rosados", super: "vinos", sort: 3 },
  { slug: "espumantes", name: "Espumantes", super: "vinos", sort: 4 },
];

// { cat, name, price (pesos), desc? }
export const RDG_PRODUCTS = [
  // ── ENTRADAS ──
  { cat: "entradas", name: "Jamón Crudo", price: 14000 },
  { cat: "entradas", name: "Ensalada Rusa", price: 6500 },
  { cat: "entradas", name: "Vithel Tonné", price: 16000 },
  { cat: "entradas", name: "Arrollado casero", price: 15500 },
  { cat: "entradas", name: "Empanadas", price: 4000, desc: "Carne, jamón y queso" },
  { cat: "entradas", name: "Empanadas de carne cortada a cuchillo", price: 4600 },
  { cat: "entradas", name: "Provoleta", price: 12000 },
  { cat: "entradas", name: "Provoleta Especial", price: 16000, desc: "Hojas verdes, jamón crudo, tomate asado" },
  { cat: "entradas", name: "Rabas con salsa tártara", price: 18000 },
  { cat: "entradas", name: "Calamarettes rebozados con rúcula y parmesano", price: 27000 },
  { cat: "entradas", name: "Langostinos rebozados en panko con papas rejillas", price: 24000 },

  // ── ENSALADAS ──
  { cat: "ensaladas", name: "Ensalada común", price: 5000, desc: "Hasta 2 gustos" },
  { cat: "ensaladas", name: "Ensalada completa", price: 6000, desc: "3+ gustos" },
  { cat: "ensaladas", name: "Adicionales c/u", price: 4000 },
  { cat: "ensaladas", name: "Rúcula y parmesano", price: 7000 },
  { cat: "ensaladas", name: "Rúcula, parmesano y aceitunas negras", price: 8500 },
  { cat: "ensaladas", name: "Capresse", price: 12000 },
  { cat: "ensaladas", name: "Pollo rebozado", price: 22000 },
  { cat: "ensaladas", name: "Del Golf", price: 24000 },
  { cat: "ensaladas", name: "Ensalada tibia de vegetales asados", price: 14000 },

  // ── MENÚ INFANTIL ──
  { cat: "menu-infantil", name: "Ñoquis o tallarines con salsa tuco o crema", price: 20000, desc: "Incluye bebida y helado" },
  { cat: "menu-infantil", name: "Milanesa de ternera o pollo con papas", price: 25000, desc: "Incluye bebida y helado" },

  // ── PASTAS (incluyen salsas comunes: tuco, crema, mixta, filete) ──
  { cat: "pastas", name: "Tallarines", price: 16000 },
  { cat: "pastas", name: "Ñoquis de papa", price: 16000 },
  { cat: "pastas", name: "Ravioles de verdura", price: 18000 },
  { cat: "pastas", name: "Crepes de verdura", price: 18000 },
  { cat: "pastas", name: "Sorrentinos de muzzarella y jamón", price: 22000 },
  { cat: "pastas", name: "Sorrentinos de calabaza asada y muzzarella", price: 22000 },
  { cat: "pastas", name: "Sorrentinos negros de salmón", price: 25000 },

  // ── SALSAS (a la carta) ──
  { cat: "salsas", name: "Bolognesa", price: 4500 },
  { cat: "salsas", name: "Cuatro quesos", price: 4500 },
  { cat: "salsas", name: "Pesto", price: 4500 },
  { cat: "salsas", name: "Mediterránea", price: 5000 },
  { cat: "salsas", name: "Graten con salsa blanca", price: 5500 },
  { cat: "salsas", name: "Parisien", price: 5500 },
  { cat: "salsas", name: "Bagnacauda", price: 4500 },
  { cat: "salsas", name: "Pomarola con langostinos", price: 14500 },

  // ── MINUTAS ──
  { cat: "minutas", name: "Omelette de jamón y queso", price: 11000 },
  { cat: "minutas", name: "Omelette de caprese", price: 12000 },
  { cat: "minutas", name: "Revuelto gramajo", price: 19000 },
  { cat: "minutas", name: "Milanesa", price: 19000 },
  { cat: "minutas", name: "Milanesa napolitana", price: 26000 },
  { cat: "minutas", name: "Milanesa de Entrecot", price: 27500 },
  { cat: "minutas", name: "Milanesa de entrecot napolitana", price: 32500 },
  { cat: "minutas", name: "Suprema", price: 16500 },
  { cat: "minutas", name: "Suprema napolitana", price: 22000 },
  { cat: "minutas", name: "Tortilla de espinaca y langostinos", price: 25000 },
  { cat: "minutas", name: "Tortilla de papa y cebolla", price: 14000 },
  { cat: "minutas", name: "Tortilla de verdura", price: 16000 },
  { cat: "minutas", name: "Merluza a la Romana", price: 17000 },

  // ── GUARNICIONES ──
  { cat: "guarniciones", name: "Espinacas al graten", price: 16000 },
  { cat: "guarniciones", name: "Puré", price: 8000 },
  { cat: "guarniciones", name: "Puré de manzana", price: 6000 },
  { cat: "guarniciones", name: "Papas fritas", price: 8500, desc: "Bastón o española" },
  { cat: "guarniciones", name: "Papas rejilla", price: 9500 },
  { cat: "guarniciones", name: "Papas a la provenzal", price: 11000 },
  { cat: "guarniciones", name: "Papas a la crema", price: 12000 },
  { cat: "guarniciones", name: "Papas gratinadas", price: 15000 },

  // ── NUESTRA COCINA ──
  { cat: "nuestra-cocina", name: "Fillet de pollo con puerros, panceta y champignones", price: 29000 },
  { cat: "nuestra-cocina", name: "Lomo en reducción de coñac y crocante de panceta", price: 38000 },
  { cat: "nuestra-cocina", name: "Lomo relleno con queso provolone", price: 38000 },
  { cat: "nuestra-cocina", name: "Entrecot en salsa ahumada de hongos de pino", price: 36000 },
  { cat: "nuestra-cocina", name: "Matambrito a la pizza", price: 38000 },
  { cat: "nuestra-cocina", name: "Mollejas al jerez con verdeo y dados de papas", price: 37000 },
  { cat: "nuestra-cocina", name: "Costillas de cerdo a la barbacoa", price: 28000 },
  { cat: "nuestra-cocina", name: "Matambrito de cerdo al roquefort con nueces", price: 38000 },
  { cat: "nuestra-cocina", name: "Calamarettes a la leonesa", price: 32000 },
  { cat: "nuestra-cocina", name: "Salmón rosado con crema de camarones", price: 44000 },
  { cat: "nuestra-cocina", name: "Salmón en salsa de limón con salteado de espinacas y champignones", price: 44000 },

  // ── NUESTRA PARRILLA ──
  { cat: "nuestra-parrilla", name: "Mollejas", price: 21500 },
  { cat: "nuestra-parrilla", name: "Chinchulines", price: 11000 },
  { cat: "nuestra-parrilla", name: "Chorizo", price: 5500 },
  { cat: "nuestra-parrilla", name: "Morcilla", price: 4500 },
  { cat: "nuestra-parrilla", name: "Asado de tira", price: 39000 },
  { cat: "nuestra-parrilla", name: "Entrecot", price: 27500 },
  { cat: "nuestra-parrilla", name: "Ojo de bife", price: 33000 },
  { cat: "nuestra-parrilla", name: "Lomo", price: 32500 },
  { cat: "nuestra-parrilla", name: "Filet de pollo", price: 24000 },
  { cat: "nuestra-parrilla", name: "Matambre de cerdo", price: 32000 },
  { cat: "nuestra-parrilla", name: "Brochette de lomo", price: 33000 },
  { cat: "nuestra-parrilla", name: "Brochette de pollo", price: 26500 },
  { cat: "nuestra-parrilla", name: "Salmón grille", price: 36000 },
  { cat: "nuestra-parrilla", name: "Pacú Grillado", price: 25000 },

  // ── POSTRES ──
  { cat: "postres", name: "Helado Simple", price: 6000 },
  { cat: "postres", name: "Helado doble", price: 8000 },
  { cat: "postres", name: "Helado Sambayón", price: 7000 },
  { cat: "postres", name: "Helado Sambayón Doble", price: 9000 },
  { cat: "postres", name: "Ensalada de frutas", price: 5000 },
  { cat: "postres", name: "Flan casero", price: 7000 },
  { cat: "postres", name: "Macedonia", price: 8000 },
  { cat: "postres", name: "Tortilla de manzanas Normanda", price: 26000, desc: "4 personas" },
  { cat: "postres", name: "Tiramisú", price: 10000 },
  { cat: "postres", name: "Queso, higos en almíbar, dulce de cayote y nueces", price: 18000 },
  { cat: "postres", name: "Mousse de chocolate", price: 10000 },
  { cat: "postres", name: "Crumble de manzana con helado de americana", price: 12000 },
  { cat: "postres", name: "Panqueques de dulce de leche", price: 9000 },
  { cat: "postres", name: "Pera al vino tinto con helado", price: 9000 },
  { cat: "postres", name: "Sambayón batido con nueces", price: 14000 },

  // ── BEBIDAS · SIN ALCOHOL ──
  { cat: "sin-alcohol", name: "Agua Mineral", price: 3500 },
  { cat: "sin-alcohol", name: "Gaseosas", price: 4000 },
  { cat: "sin-alcohol", name: "Jarra de limonada con agua o soda", price: 12000 },
  { cat: "sin-alcohol", name: "Jarra de limonada con gaseosa", price: 15000 },

  // ── BEBIDAS · CERVEZAS ──
  { cat: "cervezas", name: "Andes Rubia 473 cc", price: 6000 },
  { cat: "cervezas", name: "Stella Artois Rubia 473 cc", price: 6000 },
  { cat: "cervezas", name: "Stella Artois Noire 473 cc", price: 5900 },
  { cat: "cervezas", name: "Andes Rubia 1 Lt", price: 8500 },
  { cat: "cervezas", name: "Stella Artois Rubia 1 Lt", price: 9500 },
  { cat: "cervezas", name: "Stella Artois Noire 1 Lt", price: 8500 },

  // ── VINOS TINTOS ──
  { cat: "vinos-tintos", name: "Chakana", price: 14000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Las Perdices", price: 16000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Las Perdices Reserva", price: 21000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Diamandes Perlita Malbec", price: 18000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Diamandes Uco Malbec", price: 28000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Cuvelier Los Andes", price: 33000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Cuvelier Grand Vin 2021", price: 48000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Cuvelier Grand Malbec", price: 79000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Nicasia", price: 19500, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Saint Felicien", price: 20000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "D.V. Catena Malbec/Malbec", price: 39000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Trumpeter", price: 14500, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Rutini", price: 38000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Salentein Reserva", price: 19000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Salentein Numina", price: 30000, desc: "Malbec" },
  { cat: "vinos-tintos", name: "Angélica Zapata Alta", price: 40000, desc: "Cabernet Sauvignon" },
  { cat: "vinos-tintos", name: "Saint Felicien Cabernet Franc", price: 22000, desc: "Cabernet Franc" },
  { cat: "vinos-tintos", name: "Ala Colorada", price: 24500, desc: "Cabernet Franc" },
  { cat: "vinos-tintos", name: "Diamandes de Uco", price: 28000, desc: "Cabernet Franc" },
  { cat: "vinos-tintos", name: "Salentein Numina Cabernet Franc", price: 30000, desc: "Cabernet Franc" },
  { cat: "vinos-tintos", name: "Las Perdices Reserva Pinot Noir", price: 23000, desc: "Pinot Noir" },
  { cat: "vinos-tintos", name: "Salentein Numina Pinot Noir", price: 29000, desc: "Pinot Noir" },
  { cat: "vinos-tintos", name: "Amalaya Gran Corte", price: 22500, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "Clos de los 7 by Michel Rolland", price: 34000, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "Cuvelier Nature", price: 25000, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "Cuvelier Los Andes Colección", price: 34000, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "D.V. Catena Cabernet/Malbec", price: 30500, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "Rutini Cabernet/Malbec", price: 25000, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "Milamore", price: 36000, desc: "Blend / Corte (Dried Grapes)" },
  { cat: "vinos-tintos", name: "Las Perdices Don Juan", price: 37500, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "Diamandes Grande Reserve Malbec/Cabernet", price: 59000, desc: "Blend / Corte" },
  { cat: "vinos-tintos", name: "Cuvelier Los Andes Merlot", price: 38500, desc: "Merlot" },

  // ── VINOS BLANCOS ──
  { cat: "vinos-blancos", name: "Diamandes Perlita Chardonnay", price: 18000, desc: "Chardonnay" },
  { cat: "vinos-blancos", name: "Las Perdices Sauvignon Blanc", price: 16000, desc: "Sauvignon Blanc" },
  { cat: "vinos-blancos", name: "Trumpeter Sauvignon Blanc", price: 14500, desc: "Sauvignon Blanc" },
  { cat: "vinos-blancos", name: "Salentein Reserva Sauvignon Blanc", price: 18500, desc: "Sauvignon Blanc" },
  { cat: "vinos-blancos", name: "Salentein Numina Chardonnay", price: 30000, desc: "Chardonnay" },
  { cat: "vinos-blancos", name: "Rutini Sauvignon Blanc", price: 25000, desc: "Sauvignon Blanc" },

  // ── ROSADOS ──
  { cat: "rosados", name: "Cuvelier Rosado Malbec", price: 18000 },
  { cat: "rosados", name: "Trumpeter Reserve", price: 17500 },
  { cat: "rosados", name: "Las Perdices Exploración Rosé", price: 26500 },

  // ── ESPUMANTES ──
  { cat: "espumantes", name: "Amalaya Torrontés Riesling", price: 18000 },
  { cat: "espumantes", name: "Salentein Brut Nature", price: 24500 },
  { cat: "espumantes", name: "Baron B Extra Brut", price: 50500 },
];
