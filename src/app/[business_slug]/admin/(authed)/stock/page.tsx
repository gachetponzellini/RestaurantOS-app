import { redirect } from "next/navigation";

// El stock de bebidas se fusionó dentro de "Productos e inventario"
// (/admin/catalogo?tab=stock). Mantenemos esta ruta como redirect para
// no romper bookmarks ni links viejos.
export default async function StockPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  redirect(`/${business_slug}/admin/catalogo?tab=stock`);
}
