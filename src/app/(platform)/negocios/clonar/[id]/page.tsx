import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { CloneBusinessForm } from "@/components/super/clone-business-form";
import { getBusinessDetail } from "@/lib/platform/queries";

export default async function CloneBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = await getBusinessDetail(id);
  if (!source) redirect("/");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={`/negocios/${id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-extrabold">
        Clonar local desde {source.name}
      </h1>
      <CloneBusinessForm
        sourceBusinessId={source.id}
        sourceBusinessName={source.name}
      />
    </main>
  );
}

export const dynamic = "force-dynamic";
