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
} from "@/lib/ingredients/queries";
import { getStockOverview } from "@/lib/stock/queries";
import { getBusiness } from "@/lib/tenant";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const [
    { superCategories, stations, categories, products },
    menus,
    ingredients,
    costeo,
    stockBebidas,
    stockCocina,
  ] = await Promise.all([
    getAdminCatalog(business.id),
    getAdminDailyMenus(business.id),
    getIngredients(business.id),
    getCosteoOverview(business.id),
    getStockOverview(business.id),
    getKitchenStockFull(business.id),
  ]);
  const todayDow = currentDayOfWeek(business.timezone);

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
      />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
