import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Copy, ExternalLink } from "lucide-react";

import { InviteMemberForm } from "@/components/super/invite-member-form";
import { MemberRow } from "@/components/super/member-row";
import { Badge } from "@/components/ui/badge";
import { getBusinessDetail } from "@/lib/platform/queries";

export default async function PlatformBusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const business = await getBusinessDetail(id);
  if (!business) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold">{business.name}</h1>
            {!business.is_active && (
              <Badge variant="secondary">INACTIVO</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            /{business.slug} · {business.timezone}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <Link
            href={`/${business.slug}/admin`}
            className="text-primary inline-flex items-center gap-1 font-medium"
          >
            Entrar al panel <ExternalLink className="size-3.5" />
          </Link>
          <Link
            href={`/${business.slug}/menu`}
            className="text-muted-foreground inline-flex items-center gap-1"
          >
            Ver menú público <ExternalLink className="size-3.5" />
          </Link>
          <Link
            href={`/negocios/clonar/${business.id}`}
            className="text-muted-foreground inline-flex items-center gap-1"
          >
            Clonar local <Copy className="size-3.5" />
          </Link>
        </div>
      </header>

      <section className="bg-card rounded-xl p-4">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Invitar miembro
        </h2>
        <div className="mt-3">
          <InviteMemberForm businessId={business.id} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Miembros ({business.members.length})
        </h2>
        {business.members.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg p-6 text-center text-sm italic">
            Nadie tiene acceso todavía. Invitá a alguien arriba.
          </p>
        ) : (
          <ul className="grid gap-2">
            {business.members.map((m) => (
              <MemberRow
                key={m.user_id}
                businessId={business.id}
                member={m}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
