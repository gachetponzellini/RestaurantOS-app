-- 0053: Rendición de mozos + asignación caja↔usuario (spec 07)

-- Tabla de rendiciones por mozo (patrón espejo de caja_cortes)
create table if not exists mozo_rendiciones (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  mozo_id       uuid not null references auth.users(id),
  registered_by uuid not null references auth.users(id),
  expected_cash_cents bigint not null default 0,
  delivered_cash_cents bigint not null default 0,
  difference_cents     bigint not null default 0,
  notes         text,
  por_metodo    jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index idx_mozo_rendiciones_lookup
  on mozo_rendiciones (business_id, mozo_id, created_at desc);

-- Tabla puente caja↔usuario (n:m)
create table if not exists caja_user_assignments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  caja_id     uuid not null references cajas(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (business_id, caja_id, user_id)
);

create index idx_caja_user_assignments_lookup
  on caja_user_assignments (business_id, caja_id);

-- RLS: mozo_rendiciones
alter table mozo_rendiciones enable row level security;

create policy "members_select_rendiciones" on mozo_rendiciones
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_rendiciones" on mozo_rendiciones
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_rendiciones" on mozo_rendiciones
  for update to authenticated using (public.is_business_member(business_id));
create policy "platform_select_rendiciones" on mozo_rendiciones
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_rendiciones" on mozo_rendiciones
  for all to authenticated using (public.is_platform_admin());

-- RLS: caja_user_assignments
alter table caja_user_assignments enable row level security;

create policy "members_select_caja_assignments" on caja_user_assignments
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_caja_assignments" on caja_user_assignments
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_delete_caja_assignments" on caja_user_assignments
  for delete to authenticated using (public.is_business_member(business_id));
create policy "platform_select_caja_assignments" on caja_user_assignments
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_caja_assignments" on caja_user_assignments
  for all to authenticated using (public.is_platform_admin());
