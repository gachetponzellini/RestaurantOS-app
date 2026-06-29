-- ============================================
-- Promo codes (cupones manuales — Fase 2)
-- ============================================
-- Cada código es per-business: un código "VUELVE10" puede coexistir entre
-- dos negocios distintos. La validación en checkout busca por (business_id,
-- code) case-insensitive así "vuelve10" / "VUELVE10" matchean igual.
--
-- Tipos de descuento:
--   - percentage:    discount_value entre 0 y 100. Aplica al subtotal.
--   - fixed_amount:  discount_value en cents. Aplica al subtotal (capped).
--   - free_shipping: discount_value se ignora; pone delivery_fee_cents en 0.
--
-- Límites:
--   - max_uses NULL = ilimitado. Si no es NULL, el contador uses_count se
--     incrementa atómicamente en persist-order y se rechaza si llega al máximo.
--   - valid_from / valid_until acotan ventana temporal (NULL = sin límite).
--   - min_order_cents permite "mínimo $5000 para aplicar".
-- ============================================

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount', 'free_shipping')),
  discount_value bigint not null default 0 check (discount_value >= 0),
  min_order_cents bigint not null default 0 check (min_order_cents >= 0),
  max_uses int check (max_uses is null or max_uses > 0),
  uses_count int not null default 0 check (uses_count >= 0),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicidad case-insensitive del código por negocio: dos negocios pueden tener
-- "VUELVE10", pero un mismo negocio no puede duplicarlo.
create unique index promo_codes_business_code_lower_idx
  on public.promo_codes (business_id, lower(code));

create index promo_codes_business_active_idx
  on public.promo_codes (business_id, is_active);

create trigger promo_codes_set_updated_at
  before update on public.promo_codes
  for each row execute function public.set_updated_at();

-- ============================================
-- Linking promo to orders (snapshot pattern)
-- ============================================
-- Al aplicar un cupón en una orden guardamos:
--   - promo_code_id: FK al cupón (puede ser NULL si después se borra el
--     cupón — el snapshot del código sigue legible en el historial de orders).
--   - promo_code_snapshot: el TEXTO del código tal como lo tipeó el cliente,
--     usado para mostrar en el detalle de la orden ("Pediste con cupón VUELVE10").
-- El monto descontado vive en el campo existente `orders.discount_cents`.
alter table public.orders
  add column promo_code_id uuid references public.promo_codes(id) on delete set null,
  add column promo_code_snapshot text;

create index orders_promo_code_id_idx on public.orders (promo_code_id)
  where promo_code_id is not null;

-- ============================================
-- RLS (sigue el patrón de daily_menus / products)
-- ============================================
alter table public.promo_codes enable row level security;

-- Select / insert / update / delete: solo miembros del negocio (admin / owner).
create policy "admin_select_promo_codes" on public.promo_codes
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_insert_promo_codes" on public.promo_codes
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_promo_codes" on public.promo_codes
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_promo_codes" on public.promo_codes
  for delete to authenticated
  using (public.is_business_member(business_id));

-- ============================================
-- Atomic increment helper (avoid race conditions on uses_count)
-- ============================================
-- Devuelve true si el incremento fue posible (cupón existe + activo + no
-- excedió max_uses). Devuelve false si rechaza. Se llama desde persist-order
-- DESPUÉS de validar todo lo demás. El service_role bypassea RLS.
create or replace function public.increment_promo_use(
  p_promo_id uuid,
  p_business_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
begin
  update public.promo_codes
     set uses_count = uses_count + 1
   where id = p_promo_id
     and business_id = p_business_id
     and is_active = true
     and (max_uses is null or uses_count < max_uses)
     and (valid_from is null or valid_from <= now())
     and (valid_until is null or valid_until >= now());

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

revoke execute on function public.increment_promo_use(uuid, uuid) from public;
grant execute on function public.increment_promo_use(uuid, uuid) to service_role;
