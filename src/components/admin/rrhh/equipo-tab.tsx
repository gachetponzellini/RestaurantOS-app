"use client";

import Link from "next/link";
import { Eye, EyeOff, Users } from "lucide-react";

import { InviteUserForm } from "@/components/admin/users/invite-user-form";
import { UserRow } from "@/components/admin/users/user-row";
import {
  Surface,
  SurfaceHeader,
} from "@/components/admin/shell/page-shell";
import { Button } from "@/components/ui/button";
import type { BusinessMember } from "@/lib/admin/members-query";

export function EquipoTab({
  slug,
  businessName,
  members,
  currentUserId,
  includeDisabled,
}: {
  slug: string;
  businessName?: string;
  members: BusinessMember[];
  currentUserId: string;
  includeDisabled: boolean;
}) {
  const activeMembers = members.filter((m) => !m.disabled_at);

  return (
    <div className="space-y-6">
      <Surface padding="default">
        <SurfaceHeader
          eyebrow="Sumar empleado"
          title="Crear acceso"
          description="Armá el usuario con contraseña y compartila por WhatsApp, o generá un link de invitación."
        />
        <div className="mt-5">
          <InviteUserForm slug={slug} businessName={businessName} />
        </div>
      </Surface>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SurfaceHeader
            eyebrow="Personas"
            title={`${activeMembers.length} activos`}
          />
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={
                  includeDisabled
                    ? `/${slug}/admin/rrhh?tab=equipo`
                    : `/${slug}/admin/rrhh?tab=equipo&disabled=1`
                }
              >
                {includeDisabled ? (
                  <>
                    <EyeOff className="size-3.5" />
                    Ocultar deshabilitados
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    Ver deshabilitados
                  </>
                )}
              </Link>
            }
          />
        </div>
        {members.length === 0 ? (
          <Surface
            padding="default"
            className="grid place-items-center gap-3 p-12 text-center"
          >
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
              <Users className="size-5" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-semibold text-zinc-900">
              Nadie tiene acceso todavía
            </p>
            <p className="max-w-sm text-sm text-zinc-600">
              Sumá al primer empleado desde el formulario de arriba.
            </p>
          </Surface>
        ) : (
          <ul className="grid gap-2">
            {members.map((m) => (
              <UserRow
                key={m.user_id}
                slug={slug}
                member={m}
                canManage
                isCurrentUser={m.user_id === currentUserId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
