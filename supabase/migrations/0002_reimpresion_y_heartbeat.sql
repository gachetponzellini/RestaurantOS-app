-- ─────────────────────────────────────────────────────────────────────────
-- Spec 35 — Reimpresión de comandas + salud del print agent.
--
-- Aditiva sobre el baseline (0001). Dos piezas, ambas laterales a la máquina
-- de estados de `comandas` (pendiente → en_preparacion → entregado), que NO se
-- toca:
--
--   1. `comandas.reprint_requested_at` — flag de "reimpresión pedida". El GET
--      del print agent amplía su filtro a `status='pendiente' OR
--      reprint_requested_at IS NOT NULL`, así una comanda ya avanzada vuelve a
--      aparecerle al agente (que imprime lo que el GET trae, sin cambios). El
--      POST `ok` lo limpia y NO regresa el estado. Convive con `print_failed_at`
--      (spec 33), que sigue marcando el fallo de impresión.
--
--   2. `print_agent_status` — heartbeat por negocio. El agente hace
--      `POST /api/print-agent/heartbeat` cada ~15s → upsert de `last_seen_at`.
--      Operación deriva "conectada" (now - last_seen < 60s) vs "sin conexión
--      hace X". Escritura por service (bypassa RLS); lectura para members del
--      negocio + platform admin.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Flag de reimpresión en comandas ──────────────────────────────────────
alter table "public"."comandas"
  add column if not exists "reprint_requested_at" timestamp with time zone;

comment on column "public"."comandas"."reprint_requested_at" is
  'Spec 35: marca que se pidió reimprimir esta comanda desde operación. El GET del print agent la incluye aunque no esté `pendiente` (imprime lo que el GET trae, cero cambios en el agente); el POST `ok` lo limpia sin regresar el estado de cocina. Null = sin reimpresión pendiente.';

-- 2. Heartbeat del print agent por negocio ────────────────────────────────
create table if not exists "public"."print_agent_status" (
  "business_id" "uuid" not null,
  "last_seen_at" timestamp with time zone not null default "now"(),
  constraint "print_agent_status_pkey" primary key ("business_id"),
  constraint "print_agent_status_business_id_fkey"
    foreign key ("business_id") references "public"."businesses"("id") on delete cascade
);

alter table "public"."print_agent_status" owner to "postgres";

comment on table "public"."print_agent_status" is
  'Spec 35: heartbeat del print agent on-site. Una fila por negocio; el agente upsertea `last_seen_at` cada ~15s vía POST /api/print-agent/heartbeat. Operación deriva conectado (now - last_seen < 60s) vs caído. Escritura por service; lectura por members del negocio.';

alter table "public"."print_agent_status" enable row level security;

-- Lectura: members del negocio + platform admin (para la pill de salud en
-- operación). La escritura va por el service client del endpoint (bypassa RLS),
-- así que no se define policy de INSERT/UPDATE — igual que el resto del
-- contrato del print agent.
create policy "print_agent_status_select" on "public"."print_agent_status"
  for select to "authenticated"
  using (("public"."is_business_member"("business_id") or "public"."is_platform_admin"()));

grant all on table "public"."print_agent_status" to "anon";
grant all on table "public"."print_agent_status" to "authenticated";
grant all on table "public"."print_agent_status" to "service_role";
