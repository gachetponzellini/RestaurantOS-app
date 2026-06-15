-- ============================================
-- Spec 22 — RLS role-aware de reservas
-- ============================================
-- Las policies de escritura de `reservations` usaban `is_business_member`
-- (cualquier miembro, incluido `personal`). La app ya gateaba por rol vía
-- service client, pero la RLS quedaba más laxa que la app. Introducimos
-- `is_business_staff` (admin/encargado/mozo, activos) como backstop coherente
-- con el principio "permisos por rol, sin excepciones".
--
-- SELECT no cambia: leer la agenda es inocuo para cualquier miembro. El cliente
-- dueño conserva el UPDATE de su propia reserva (cancelar online).
-- ============================================

create or replace function public.is_business_staff(bid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1 from public.business_users
    where business_id = bid
      and user_id = auth.uid()
      and role in ('admin', 'encargado', 'mozo')
      and disabled_at is null
  );
$$;

revoke all on function public.is_business_staff(uuid) from public;
grant execute on function public.is_business_staff(uuid) to authenticated;

-- Escritura: solo staff. Insert/Delete del cliente nunca pasan por acá (los
-- hace la server action con service role); por eso no llevan rama user_id.
drop policy if exists admin_insert_reservations on public.reservations;
create policy admin_insert_reservations on public.reservations
  for insert to authenticated
  with check (public.is_business_staff(business_id));

drop policy if exists admin_delete_reservations on public.reservations;
create policy admin_delete_reservations on public.reservations
  for delete to authenticated
  using (public.is_business_staff(business_id));

-- Update: staff del negocio O el cliente dueño (cancelar la propia).
drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations
  for update to authenticated
  using (public.is_business_staff(business_id) or user_id = (select auth.uid()))
  with check (public.is_business_staff(business_id) or user_id = (select auth.uid()));
