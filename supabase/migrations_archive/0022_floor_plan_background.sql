-- ============================================
-- Floor plan v2: imagen de fondo (foto del plano real)
-- ============================================
-- Permite que el admin suba una foto del plano del salón (un render, una
-- foto del croquis dibujado en papel, un PDF exportado a PNG, etc.) y
-- coloque las mesas encima como overlay. La opacidad es ajustable para
-- que el dibujo de mesas no compita con la foto de referencia.

alter table public.floor_plans
  add column if not exists background_image_url text,
  add column if not exists background_opacity int not null default 60
    check (background_opacity between 0 and 100);

-- ============================================
-- Storage bucket: floor-plans
-- Misma convención que `products`: path = <business_id>/<uuid>.<ext>.
-- Lectura pública para que el editor y la pantalla de reservas puedan
-- mostrar la imagen sin firmar URLs.
-- ============================================
insert into storage.buckets (id, name, public)
values ('floor-plans', 'floor-plans', true)
on conflict (id) do nothing;

create policy "public_read_floor_plans"
  on storage.objects for select
  using (bucket_id = 'floor-plans');

create policy "admin_insert_floor_plans_storage"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'floor-plans'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "admin_update_floor_plans_storage"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'floor-plans'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "admin_delete_floor_plans_storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'floor-plans'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

-- Platform admin: puede gestionar cualquier prefijo (mismo patrón que el
-- bucket `products` en migración 0007).
create policy "platform_insert_floor_plans_storage"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'floor-plans' and public.is_platform_admin());

create policy "platform_update_floor_plans_storage"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'floor-plans' and public.is_platform_admin());

create policy "platform_delete_floor_plans_storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'floor-plans' and public.is_platform_admin());
