"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Eye, EyeOff, Search, UserPlus, Users } from "lucide-react";

import { InviteUserForm } from "@/components/admin/users/invite-user-form";
import { UserRow } from "@/components/admin/users/user-row";
import { Surface } from "@/components/admin/shell/page-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RoleBadge } from "@/components/shared/role-badge";
import type { BusinessMember } from "@/lib/admin/members-query";
import type { MonthlySummaryRow } from "@/lib/rrhh/clock-queries";
import { formatHours, formatHoursDecimal, relativeDate } from "@/lib/rrhh/format-utils";
import { cn } from "@/lib/utils";

const ALL_ROLES = ["admin", "encargado", "mozo", "personal"] as const;

export function EquipoTab({
  slug,
  businessName,
  members,
  currentUserId,
  includeDisabled,
  employeeClockData,
}: {
  slug: string;
  businessName?: string;
  members: BusinessMember[];
  currentUserId: string;
  includeDisabled: boolean;
  employeeClockData?: MonthlySummaryRow[];
}) {
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const activeCount = members.filter((m) => !m.disabled_at).length;
  const disabledCount = members.filter((m) => m.disabled_at).length;

  const clockMap = useMemo(() => {
    const map = new Map<string, MonthlySummaryRow>();
    for (const row of employeeClockData ?? []) {
      map.set(row.userId, row);
    }
    return map;
  }, [employeeClockData]);

  const filtered = useMemo(() => {
    let list = members;
    if (roleFilter) list = list.filter((m) => m.role === roleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          (m.full_name ?? "").toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [members, roleFilter, search]);

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-zinc-900">
            {activeCount} activos
            {disabledCount > 0 && (
              <span className="font-normal text-zinc-500">
                {" "}· {disabledCount} deshabilitados
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger
              render={
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  <UserPlus className="size-3.5" />
                  Nuevo empleado
                </button>
              }
            />
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Sumar empleado</DialogTitle>
              </DialogHeader>
              <InviteUserForm slug={slug} businessName={businessName} />
            </DialogContent>
          </Dialog>
          <Link
            href={
              includeDisabled
                ? `/${slug}/admin/rrhh?tab=equipo`
                : `/${slug}/admin/rrhh?tab=equipo&disabled=1`
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200/70 transition hover:bg-zinc-50"
          >
            {includeDisabled ? (
              <>
                <EyeOff className="size-3.5" />
                Ocultar
              </>
            ) : (
              <>
                <Eye className="size-3.5" />
                Deshabilitados
              </>
            )}
          </Link>
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={roleFilter === null}
            onClick={() => setRoleFilter(null)}
          >
            Todos
          </FilterChip>
          {ALL_ROLES.map((r) => (
            <FilterChip
              key={r}
              active={roleFilter === r}
              onClick={() => setRoleFilter(roleFilter === r ? null : r)}
            >
              <RoleBadge role={r} size="xs" />
            </FilterChip>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 rounded-lg border-0 bg-zinc-100 pl-8 pr-3 text-xs text-zinc-900 outline-none ring-1 ring-zinc-200/60 placeholder:text-zinc-400 focus:ring-zinc-300"
          />
        </div>
      </div>

      {/* Employee list */}
      {filtered.length === 0 ? (
        <Surface
          padding="default"
          className="grid place-items-center gap-3 p-12 text-center"
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
            <Users className="size-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-semibold text-zinc-900">
            {members.length === 0
              ? "Nadie tiene acceso todavía"
              : "Sin resultados"}
          </p>
          <p className="max-w-sm text-sm text-zinc-600">
            {members.length === 0
              ? "Sumá al primer empleado con el botón de arriba."
              : "Probá con otro filtro o buscá por nombre."}
          </p>
        </Surface>
      ) : (
        <ul className="grid gap-2">
          {filtered.map((m) => {
            const clock = clockMap.get(m.user_id);
            return (
              <EmployeeCard
                key={m.user_id}
                slug={slug}
                member={m}
                canManage
                isCurrentUser={m.user_id === currentUserId}
                clockData={clock}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmployeeCard({
  slug,
  member,
  canManage,
  isCurrentUser,
  clockData,
}: {
  slug: string;
  member: BusinessMember;
  canManage: boolean;
  isCurrentUser: boolean;
  clockData?: MonthlySummaryRow;
}) {
  return (
    <div className="space-y-2">
      <UserRow
          slug={slug}
          member={member}
          canManage={canManage}
          isCurrentUser={isCurrentUser}
          lastClockIn={clockData?.lastClockIn ?? null}
        />
        {/* Monthly stats bar */}
        {clockData && (
          <div className="ml-13 flex flex-wrap gap-x-5 gap-y-1 pl-[52px] text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3 text-zinc-400" />
              <span className="font-semibold tabular-nums text-zinc-700">
                {formatHoursDecimal(clockData.totalMinutes)}
              </span>{" "}
              este mes
            </span>
            <span>
              <span className="font-semibold tabular-nums text-zinc-700">
                {clockData.daysWorked}
              </span>{" "}
              días
            </span>
            <span>
              Prom{" "}
              <span className="font-semibold tabular-nums text-zinc-700">
                {formatHours(clockData.avgMinutesPerDay)}
              </span>
              /día
            </span>
          </div>
        )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-zinc-900 text-white"
          : "bg-white text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}
