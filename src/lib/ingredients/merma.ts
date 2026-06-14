// ── Merma estimativa por período (spec 10) ───────────────────────
// Lógica pura y testeable: cruza entradas (compras) vs. salidas (ventas +
// merma registrada) de `ingredient_consumptions` y estima la merma teórica a
// partir del waste_percent del insumo. Es un reporte APROXIMADO (lo aclara la
// reunión): no es inventario contable. Dinero/cantidades sin floats de plata;
// las cantidades son numeric del insumo (kg/lt/un/g/ml).

import type { ConsumptionKind, IngredientUnit } from "./types";

/** Fila cruda de consumo, ya scopeada por negocio y rango de fechas. */
export type MermaConsumptionRow = {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: IngredientUnit;
  wastePercent: number;
  kind: ConsumptionKind;
  quantity: number;
};

export type MermaReportItem = {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: IngredientUnit;
  wastePercent: number;
  /** Entró: suma de consumos kind='compra'. */
  enteredQty: number;
  /** Vendido: suma de consumos kind='venta'. */
  ventaQty: number;
  /** Merma cargada a mano: suma de consumos kind='merma'. */
  mermaRegistradaQty: number;
  /** Salió = venta + merma registrada. */
  exitedQty: number;
  /** Merma teórica estimada = entró × waste_percent / 100. */
  mermaEstimadaQty: number;
  /** Diferencia entre lo que entró y lo que salió (entró − salió). */
  diffQty: number;
};

/** Redondeo a 4 decimales para evitar ruido de punto flotante. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Agrega las filas de consumo por insumo y calcula el reporte de merma.
 * Las filas de kind 'reversion'/'ajuste' no cuentan como salida ni entrada
 * (revierten un descargo previo / corrigen inventario, no son merma).
 */
export function computeMermaReport(
  rows: MermaConsumptionRow[],
): MermaReportItem[] {
  const map = new Map<
    string,
    {
      ingredientName: string;
      ingredientUnit: IngredientUnit;
      wastePercent: number;
      entered: number;
      venta: number;
      merma: number;
    }
  >();

  for (const row of rows) {
    let acc = map.get(row.ingredientId);
    if (!acc) {
      acc = {
        ingredientName: row.ingredientName,
        ingredientUnit: row.ingredientUnit,
        wastePercent: row.wastePercent,
        entered: 0,
        venta: 0,
        merma: 0,
      };
      map.set(row.ingredientId, acc);
    }
    const qty = Math.abs(row.quantity);
    if (row.kind === "compra") acc.entered += qty;
    else if (row.kind === "venta") acc.venta += qty;
    else if (row.kind === "merma") acc.merma += qty;
  }

  return [...map.entries()]
    .map(([ingredientId, acc]) => {
      const exitedQty = acc.venta + acc.merma;
      return {
        ingredientId,
        ingredientName: acc.ingredientName,
        ingredientUnit: acc.ingredientUnit,
        wastePercent: acc.wastePercent,
        enteredQty: round4(acc.entered),
        ventaQty: round4(acc.venta),
        mermaRegistradaQty: round4(acc.merma),
        exitedQty: round4(exitedQty),
        mermaEstimadaQty: round4((acc.entered * acc.wastePercent) / 100),
        diffQty: round4(acc.entered - exitedQty),
      };
    })
    .sort((a, b) => b.enteredQty - a.enteredQty);
}
