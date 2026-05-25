-- 0045_rrhh.sql
-- Módulo de RRHH: rol personal, PIN de fichado, tabla clock_entries.

-- 1. Agregar rol 'personal' al check constraint de business_users
alter table public.business_users
  drop constraint if exists business_users_role_check;

alter table public.business_users
  add constraint business_users_role_check
  check (role in ('admin', 'encargado', 'mozo', 'personal'));

-- 2. Columna PIN en business_users
alter table public.business_users
  add column if not exists pin char(4);

create unique index if not exists business_users_pin_unique_idx
  on public.business_users (business_id, pin)
  where pin is not null and disabled_at is null;

-- 3. Tabla clock_entries
create table if not exists public.clock_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  user_id uuid not null references auth.users(id),
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  duration_minutes int generated always as (
    case when clock_out is not null
      then extract(epoch from (clock_out - clock_in))::int / 60
      else null
    end
  ) stored,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists clock_entries_business_date_idx
  on public.clock_entries (business_id, clock_in desc);

create index if not exists clock_entries_user_idx
  on public.clock_entries (user_id, clock_in desc);

-- 4. RLS
alter table public.clock_entries enable row level security;

create policy "clock_entries_select" on public.clock_entries
  for select using (
    business_id in (
      select business_id from public.business_users
      where user_id = auth.uid() and disabled_at is null
    )
  );
