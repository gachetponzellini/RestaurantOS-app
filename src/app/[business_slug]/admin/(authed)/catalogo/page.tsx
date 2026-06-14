import { formatInTimeZone } from "date-fns-tz";
import { notFound } from "next/navigation";

import { CatalogShell } from "@/components/admin/catalog/catalog-shell";
import { PageShell } from "@/components/admin/shell/page-shell";
import { getAdminCatalog } from "@/lib/admin/catalog-query";
import { getAdminDailyMenus } from "@/lib/admin/daily-menu-query";
import { currentDayOfWeek } from "@/lib/day-of-week";
import {
  getCosteoOverview,
  getIngredients,
  getKitchenStockFull,
  getMermaReport,
} from "@/lib/ingredients/queries";
import {
  getAllProductsForConfig,
  getBarStockOverview,
  getStockOverview,
} from "@/lib/stock/queries";
import { getBusiness } from "@/lib/tenant";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  // Rango por defecto del reporte de merma: mes en curso (timezone del negocio).
  const today = formatInTimeZone(new Date(), business.timezone, "yyyy-MM-dd");
  const mermaFrom = `${today.slice(0, 8)}01`;
  const mermaTo = today;

  const [
    { superCategories, stations, categories, products },
    menus,
    ingredients,
    costeo,
    stockBebidas,
    stockCocina,
    stockBar,
    productsForConfig,
    merma,
  ] = await Promise.all([
    getAdminCatalog(business.id),
    getAdminDailyMenus(business.id),
    getIngredients(business.id),
    getCosteoOverview(business.id),
    getStockOverview(business.id),
    getKitchenStockFull(business.id),
    getBarStockOverview(business.id),
    getAllProductsForConfig(business.id),
    getMermaReport(business.id, mermaFrom, mermaTo, business.timezone),
  ]);
  const todayDow = currentDayOfWeek(business.timezone);

  // Candidatos a stock de bar: productos activos que todavía no son de bar.
  const barCandidates = productsForConfig
    .filter((p) => !p.isBarStock)
    .map((p) => ({ id: p.id, name: p.name, categoryName: p.categoryName }));

  return (
    <PageShell width="default">
      <CatalogShell
        slug={business_slug}
        businessId={business.id}
        superCategories={superCategories}
        stations={stations}
        categories={categories}
        products={products}
        menus={menus}
        todayDow={todayDow}
        ingredients={ingredients}
        costeo={costeo}
        stockBebidas={stockBebidas}
        stockCocina={stockCocina}
        stockBar={stockBar}
        barCandidates={barCandidates}
        merma={merma}
        mermaFrom={mermaFrom}
        mermaTo={mermaTo}
      />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
