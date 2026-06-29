-- ============================================
-- Menús del día: combos cerrados con disponibilidad por día de la semana.
-- Un menú es una unidad atómica (Entrada + Principal + Postre...) con
-- precio único que solo aparece ciertos días. Vive aparte de `products`
-- porque no comparte lógica (no tiene modifiers, no es categorizable, etc.).
-- ============================================

create table public.daily_menus (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  price_cents bigint not null check (price_cents >= 0),
  image_url text,
  -- Array de días de la semana en los que está disponible. 0 = domingo, 6 = sábado.
  -- Check garantiza que todos los elementos del array caigan en ese rango.
  available_days int[] not null default '{}'::int[]
    check (available_days <@ array[0,1,2,3,4,5,6]),
  -- is_active: visible en el catálogo (toggle "publicado").
  -- is_available: corto manual para "se agotó hoy" sin perder la config.
  is_active boolean not null default true,
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create index on public.daily_menus using gin (available_days);
create index on public.daily_menus (business_id, is_active);

-- Trigger reutiliza set_updated_at() creada en 0001_init.sql
create trigger daily_menus_set_updated_at
  before update on public.daily_menus
  for each row execute function public.set_updated_at();

-- Componentes del combo: texto libre (no referencian a products porque los
-- ítems del menú suelen ser específicos y no existen como producto vendible).
-- Ej: { label: "Milanesa con puré", description: "200g, con crema de papas" }
create table public.daily_menu_components (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.daily_menus(id) on delete cascade,
  label text not null,
  description text,
  sort_order int not null default 0
);

create index on public.daily_menu_components (menu_id);

-- ============================================
-- RLS + policies (replica el pattern de 0002/0004 para products/modifiers)
-- ============================================
alter table public.daily_menus enable row level security;
alter table public.daily_menu_components enable row level security;

-- Select público (catálogo anónimo ve los menús activos a través del
-- service role en getMenu; esta policy habilita el acceso authenticated).
create policy "admin_select_daily_menus" on public.daily_menus
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_insert_daily_menus" on public.daily_menus
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_daily_menus" on public.daily_menus
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_daily_menus" on public.daily_menus
  for delete to authenticated
  using (public.is_business_member(business_id));

-- Componentes: accesso derivado por el menú padre.
create policy "admin_select_daily_menu_components" on public.daily_menu_components
  for select to authenticated
  using (exists (
    select 1 from public.daily_menus m
    where m.id = daily_menu_components.menu_id
      and public.is_business_member(m.business_id)
  ));

create policy "admin_insert_daily_menu_components" on public.daily_menu_components
  for insert to authenticated
  with check (exists (
    select 1 from public.daily_menus m
    where m.id = daily_menu_components.menu_id
      and public.is_business_member(m.business_id)
  ));

create policy "admin_update_daily_menu_components" on public.daily_menu_components
  for update to authenticated
  using (exists (
    select 1 from public.daily_menus m
    where m.id = daily_menu_components.menu_id
      and public.is_business_member(m.business_id)
  ))
  with check (exists (
    select 1 from public.daily_menus m
    where m.id = daily_menu_components.menu_id
      and public.is_business_member(m.business_id)
  ));

create policy "admin_delete_daily_menu_components" on public.daily_menu_components
  for delete to authenticated
  using (exists (
    select 1 from public.daily_menus m
    where m.id = daily_menu_components.menu_id
      and public.is_business_member(m.business_id)
  ));

-- ============================================
-- order_items: soportar líneas de menú además de productos.
-- product_id ya es nullable en 0001_init.sql. Agregamos daily_menu_id y un
-- snapshot JSON para preservar el combo en el pedido, y un check que obliga
-- a que cada línea sea O un producto O un menú (no ambos, no ninguno).
-- ============================================
alter table public.order_items
  add column daily_menu_id uuid references public.daily_menus(id),
  add column daily_menu_snapshot jsonb;

alter table public.order_items
  add constraint order_items_product_or_menu_check
    check ((product_id is not null) or (daily_menu_id is not null));
