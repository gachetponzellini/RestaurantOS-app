// ── Domain types for ingredients, presentations, recipes & costing ──
// Extended in 0051: sub-recipes (composite ingredients) + consumption log

export type IngredientUnit = "kg" | "lt" | "un" | "g" | "ml";

export const INGREDIENT_UNITS: { value: IngredientUnit; label: string }[] = [
  { value: "kg", label: "Kilogramos" },
  { value: "lt", label: "Litros" },
  { value: "un", label: "Unidades" },
  { value: "g", label: "Gramos" },
  { value: "ml", label: "Mililitros" },
];

// ── Ingredient (insumo) ──────────────────────────────────────────

export type Ingredient = {
  id: string;
  businessId: string;
  name: string;
  unit: IngredientUnit;
  wastePercent: number;
  stockQuantity: number;
  stockMinAlert: number | null;
  isActive: boolean;
  isComposite: boolean;
  createdAt: string;
  updatedAt: string;
};

// ── Presentation (envase / presentación) ─────────────────────────

export type IngredientPresentation = {
  id: string;
  ingredientId: string;
  name: string;
  netQuantity: number;
  costCents: number;
  isDefault: boolean;
  createdAt: string;
};

// ── Ingredient with presentations (for detail views) ─────────────

export type IngredientWithPresentations = Ingredient & {
  presentations: IngredientPresentation[];
  /** Sub-recipe lines (only populated when is_composite = true) */
  subRecipe: IngredientRecipeLine[];
};

// ── Sub-recipe line (link ingrediente compuesto → sub-ingrediente) ──

export type IngredientRecipeLine = {
  id: string;
  parentIngredientId: string;
  childIngredientId: string;
  childIngredientName: string;
  childIngredientUnit: IngredientUnit;
  quantity: number;
  notes: string | null;
  /** Cost per base unit of the child ingredient (cents) */
  costPerUnit: number | null;
  /** waste_percent of the child ingredient */
  wastePercent: number;
};

// ── Recipe line (link producto → ingrediente) ────────────────────

export type RecipeLine = {
  id: string;
  productId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: IngredientUnit;
  quantity: number;
  notes: string | null;
  /** Cost per base unit from default presentation (cents) */
  costPerUnit: number | null;
  /** waste_percent from ingredient */
  wastePercent: number;
};

// ── Food cost calculation ────────────────────────────────────────

export type FoodCostResult = {
  /** Total food cost in cents */
  totalCents: number;
  /** Margin % = (price - cost) / price × 100 */
  marginPercent: number | null;
  /** Per-ingredient breakdown */
  lines: {
    ingredientId: string;
    ingredientName: string;
    quantity: number;
    unit: IngredientUnit;
    costPerUnit: number;
    wastePercent: number;
    lineCostCents: number;
  }[];
};

// ── Ingredient list item (for overview tables) ───────────────────

export type IngredientOverview = Ingredient & {
  defaultPresentation: {
    name: string;
    costCents: number;
    netQuantity: number;
  } | null;
  presentationCount: number;
  recipeCount: number;
  stockStatus: "ok" | "low" | "out";
};

// ── Price log entry ──────────────────────────────────────────────

export type PriceLogEntry = {
  id: string;
  ingredientId: string;
  presentationId: string | null;
  presentationName: string | null;
  oldCostCents: number;
  newCostCents: number;
  recordedAt: string;
  recordedBy: string | null;
};

// ── Costeo overview (for rentability report) ─────────────────────

export type ProductCosteo = {
  productId: string;
  productName: string;
  categoryName: string | null;
  priceCents: number;
  foodCostCents: number;
  marginPercent: number;
  marginCents: number;
  hasRecipe: boolean;
};

// ── Ingredient consumption log entry ────────────────────────────

export type ConsumptionKind = "venta" | "reversion" | "ajuste" | "merma" | "compra";

export type IngredientConsumption = {
  id: string;
  businessId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: IngredientUnit;
  orderItemId: string | null;
  quantity: number;
  costCentsSnapshot: number;
  kind: ConsumptionKind;
  createdAt: string;
};
