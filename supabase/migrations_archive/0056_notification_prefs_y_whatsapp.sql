-- ═══════════════════════════════════════════════════════════════════════
-- 0056 — Notificaciones configurables + cola WhatsApp + estado del chatbot
-- (spec 15 · chatbot-y-notificaciones-whatsapp)
--
-- Cuatro cambios:
--
-- 1. chatbot_configs.chatbot_enabled — flag por negocio para prender/apagar el
--    bot. El estado "listo para responder" = (ANTHROPIC_API_KEY presente en env)
--    AND chatbot_enabled. El valor de la key NUNCA vive acá (sólo en env del
--    deploy on-site); esta columna es sólo el switch del dueño.
--
-- 2. notification_preferences — quién recibe qué evento interno y por qué canal.
--    Reemplaza el ruteo hardcodeado en cada createNotification(). Tabla VACÍA =
--    comportamiento actual (el default in_app vive en código, no en la tabla),
--    así no hay que seedear para mantener back-compat.
--
-- 3. whatsapp_outbox — cola de salida de WhatsApp, para notifs del negocio
--    (kind='notification') y para avisos al cliente por estado de delivery
--    (kind='delivery_status'). Mismo patrón que campaign_messages: status
--    pending/sent/failed. El envío real depende de la cuenta de Meta por local
--    (cambio 14); hoy el sender es stub → las filas quedan en 'failed' con
--    motivo, sin romper la operación que las originó.
--
-- 4. delivery_message_templates — plantilla editable por estado de delivery,
--    con placeholders ({cliente}, {numero}, {negocio}, {eta}). Sin fila para un
--    estado → se usa la plantilla default de código.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. chatbot_configs.chatbot_enabled
-- ─────────────────────────────────────────────────────────────────────

alter table public.chatbot_configs
  add column if not exists chatbot_enabled boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────
-- 2. notification_preferences (evento × destinatario × canal)
--    target_role XOR target_user_id (al menos uno). channel ∈ in_app/whatsapp.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  target_role text check (target_role in ('admin', 'encargado', 'mozo')),
  target_user_id uuid references public.users(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'whatsapp')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_prefs_target_check
    check ((target_role is not null) or (target_user_id is not null))
);

-- Unicidad por (negocio, evento, destinatario, canal). target_role y
-- target_user_id son mutuamente excluyentes en la práctica; un UNIQUE normal
-- trataría los NULL como distintos y dejaría pasar duplicados, así que usamos
-- dos índices únicos parciales (uno por tipo de destinatario).
create unique index if not exists notification_prefs_role_uniq
  on public.notification_preferences (business_id, event_type, target_role, channel)
  where target_role is not null;

create unique index if not exists notification_prefs_user_uniq
  on public.notification_preferences (business_id, event_type, target_user_id, channel)
  where target_user_id is not null;

create index if not exists notification_prefs_lookup_idx
  on public.notification_preferences (business_id, event_type);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "members_select_notification_preferences" on public.notification_preferences
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_notification_preferences" on public.notification_preferences
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_notification_preferences" on public.notification_preferences
  for update to authenticated using (public.is_business_member(business_id));
create policy "members_delete_notification_preferences" on public.notification_preferences
  for delete to authenticated using (public.is_business_member(business_id));

create policy "platform_select_notification_preferences" on public.notification_preferences
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_notification_preferences" on public.notification_preferences
  for all to authenticated using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 3. whatsapp_outbox (cola de salida)
--    kind: 'notification' (al negocio) | 'delivery_status' (al cliente).
--    ref_id: el recurso que originó el mensaje (notification.id u order.id).
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  to_phone text,
  body text not null,
  kind text not null check (kind in ('notification', 'delivery_status')),
  ref_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists whatsapp_outbox_status_idx
  on public.whatsapp_outbox (business_id, status);

create index if not exists whatsapp_outbox_kind_idx
  on public.whatsapp_outbox (business_id, kind, created_at desc);

alter table public.whatsapp_outbox enable row level security;

-- Members del negocio pueden ver su cola (tiene PII: teléfonos de clientes,
-- por eso scopeado por business_id). Insert/update sólo via service-role desde
-- el server (igual que notifications, 0029) — no hay policy de write para members.
create policy "members_select_whatsapp_outbox" on public.whatsapp_outbox
  for select to authenticated using (public.is_business_member(business_id));

create policy "platform_select_whatsapp_outbox" on public.whatsapp_outbox
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_whatsapp_outbox" on public.whatsapp_outbox
  for all to authenticated using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 4. delivery_message_templates (plantilla editable por estado)
--    Sin fila para un estado → el código usa la plantilla default.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.delivery_message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null
    check (status in ('preparing', 'ready', 'on_the_way', 'delivered', 'cancelled')),
  body text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, status)
);

create index if not exists delivery_templates_business_idx
  on public.delivery_message_templates (business_id);

create trigger delivery_message_templates_set_updated_at
  before update on public.delivery_message_templates
  for each row execute function set_updated_at();

alter table public.delivery_message_templates enable row level security;

create policy "members_select_delivery_templates" on public.delivery_message_templates
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_delivery_templates" on public.delivery_message_templates
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_delivery_templates" on public.delivery_message_templates
  for update to authenticated using (public.is_business_member(business_id));
create policy "members_delete_delivery_templates" on public.delivery_message_templates
  for delete to authenticated using (public.is_business_member(business_id));

create policy "platform_select_delivery_templates" on public.delivery_message_templates
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_delivery_templates" on public.delivery_message_templates
  for all to authenticated using (public.is_platform_admin());
