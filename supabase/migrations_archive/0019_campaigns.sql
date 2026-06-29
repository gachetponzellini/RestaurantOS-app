-- ============================================
-- Campañas (Fase 3)
-- ============================================
-- Una "campaña" es un envío masivo: el dueño define audiencia + promo + mensaje
-- y al lanzarla el sistema genera un código personal por cliente y materializa
-- un `campaign_message` con el texto renderizado.
--
-- Channel pluggable: hoy solo "manual" (el dueño abre wa.me con cada cliente),
-- mañana "waba" cuando la cuenta de Meta esté activa. La interfaz queda igual
-- — solo cambia el dispatcher.
-- ============================================

-- ── 1. Personal promo codes — agregar customer_id al promo --
-- Cuando una campaña genera códigos personales, los crea CON customer_id.
-- Los códigos manuales (Fase 2) tienen customer_id = NULL (cualquiera los usa).
alter table public.promo_codes
  add column customer_id uuid references public.customers(id) on delete set null;

create index promo_codes_customer_id_idx on public.promo_codes (customer_id)
  where customer_id is not null;

-- ── 2. campaigns ──────────────────────────────────────────
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,

  -- Audience
  -- 'segment': resolvemos en launch via lib/customers/segments.ts
  -- 'all': todos los clientes
  -- 'manual': lista explícita de customer_ids en audience_customer_ids
  audience_type text not null default 'segment'
    check (audience_type in ('segment', 'all', 'manual')),
  audience_segment text
    check (audience_segment is null or audience_segment in
      ('new', 'frequent', 'top', 'inactive', 'lost', 'regular')),
  audience_customer_ids uuid[],

  -- Promo cloned per customer at launch time
  -- Snapshot of promo config (we don't link to a promo_code template since the
  -- template is just config — we MATERIALIZE one personal code per customer
  -- when the campaign launches).
  promo_template jsonb not null,
  -- Shape: { discount_type, discount_value, min_order_cents, valid_until_days?: number }

  -- Message template with placeholders: {name}, {code}, {discount}
  message_template text not null,

  -- Channel: how the message is delivered. Today only "manual"; "waba" cuando
  -- llegue la cuenta de Meta.
  channel text not null default 'manual'
    check (channel in ('manual', 'waba')),

  -- Status lifecycle
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'cancelled')),

  -- Stats (denormalized, updated on launch and via triggers)
  audience_count int not null default 0,
  sent_count int not null default 0,
  redeemed_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  launched_at timestamptz
);

create index campaigns_business_status_idx on public.campaigns (business_id, status, created_at desc);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ── 3. campaign_messages ──────────────────────────────────
-- Una fila por (campaign × cliente). Materializa el mensaje renderizado +
-- vincula al código personal generado para ese cliente.
create table public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  -- Snapshot — el teléfono del cliente al momento del envío
  customer_phone text not null,
  customer_name text,
  -- Message rendered con placeholders ya sustituidos
  rendered_message text not null,
  -- Promo personal generado al lanzar la campaña
  promo_code_id uuid references public.promo_codes(id) on delete set null,
  promo_code_text text,
  -- Estado del envío:
  --   'pending'  → generado, listo para enviar (manual: dueño todavía no clickeó wa.me)
  --   'sent'     → marcado como enviado por el dueño (o por WABA cuando exista)
  --   'failed'   → futuro: WABA reportó error
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  -- Cuando un order usa este código, llenamos redeemed_at desde un trigger
  redeemed_at timestamptz,
  redeemed_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create index campaign_messages_campaign_idx on public.campaign_messages (campaign_id, status);
create index campaign_messages_promo_idx on public.campaign_messages (promo_code_id)
  where promo_code_id is not null;

-- ── 4. Trigger: cuando una orden usa un promo personal de una campaña, marcar
--    el campaign_message como redeemed. Mantenemos el ciclo de feedback sin
--    consultas costosas en el list view.
create or replace function public.mark_campaign_message_redeemed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.promo_code_id is not null then
    update public.campaign_messages
       set redeemed_at = coalesce(redeemed_at, now()),
           redeemed_order_id = coalesce(redeemed_order_id, NEW.id)
     where promo_code_id = NEW.promo_code_id
       and customer_id = NEW.customer_id
       and redeemed_at is null;

    -- Bump campaign counter (best-effort — no error if 0 rows match)
    update public.campaigns
       set redeemed_count = redeemed_count + 1
     where id in (
       select campaign_id
         from public.campaign_messages
        where promo_code_id = NEW.promo_code_id
          and customer_id = NEW.customer_id
     );
  end if;
  return NEW;
end;
$$;

create trigger orders_mark_campaign_redeemed
  after insert on public.orders
  for each row
  when (NEW.promo_code_id is not null)
  execute function public.mark_campaign_message_redeemed();

-- ── 5. RLS ────────────────────────────────────────────────
alter table public.campaigns enable row level security;
alter table public.campaign_messages enable row level security;

create policy "admin_select_campaigns" on public.campaigns
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_insert_campaigns" on public.campaigns
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_campaigns" on public.campaigns
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_campaigns" on public.campaigns
  for delete to authenticated
  using (public.is_business_member(business_id));

-- campaign_messages: derived access via parent campaign
create policy "admin_select_campaign_messages" on public.campaign_messages
  for select to authenticated
  using (exists (
    select 1 from public.campaigns c
    where c.id = campaign_messages.campaign_id
      and public.is_business_member(c.business_id)
  ));

create policy "admin_update_campaign_messages" on public.campaign_messages
  for update to authenticated
  using (exists (
    select 1 from public.campaigns c
    where c.id = campaign_messages.campaign_id
      and public.is_business_member(c.business_id)
  ));
