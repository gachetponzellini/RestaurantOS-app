import { notFound } from "next/navigation";

import { ProductForm } from "@/components/admin/catalog/product-form";
import { RecipeSection } from "@/components/admin/catalog/recipe-section";
import { ProductDeleteButton } from "@/components/admin/catalog/product-delete-button";
import { PageHeader, PageShell, Surface } from "@/components/admin/shell/page-shell";
import {
  getAdminCatalog,
  getAdminProduct,
} from "@/lib/admin/catalog-query";
import {
  calculateFoodCost,
  getIngredientsForSearch,
  getRecipeForProduct,
} from "@/lib/ingredients/queries";
import { getBusiness } from "@/lib/tenant";

export default async function EditProductoPage({
  params,
}: {
  params: Promise<{ business_slug: string; id: string }>;
}) {
  const { business_slug, id } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const [product, { categories, stations }, recipeLines, ingredientOptions] =
    await Promise.all([
      getAdminProduct(id),
      getAdminCatalog(business.id),
      getRecipeForProduct(id),
      getIngredientsForSearch(business.id),
    ]);
  if (!product) notFound();

  const foodCost = await calculateFoodCost(id, product.price_cents);

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="Catálogo · editar"
        title={product.name}
        back={{
          href: `/${business_slug}/admin/catalogo`,
          label: "Volver al catálogo",
        }}
        size="compact"
      />
      <Surface padding="default">
        <ProductForm
          slug={business_slug}
          businessId={business.id}
          categories={categories}
          stations={stations}
          product={product}
        />
      </Surface>

      <Surface padding="default">
        <RecipeSection
          slug={business_slug}
          productId={id}
          priceCents={product.price_cents}
          recipeLines={recipeLines}
          ingredientOptions={ingredientOptions}
          foodCost={foodCost}
        />
      </Surface>

      <Surface padding="default">
        <ProductDeleteButton
          slug={business_slug}
          productId={id}
          productName={product.name}
        />
      </Surface>
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
