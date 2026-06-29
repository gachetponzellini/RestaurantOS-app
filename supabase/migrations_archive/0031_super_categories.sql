-- ============================================
-- Bloque 4 v3 · Supercategorías per business
-- ============================================
-- Reemplaza la heurística client-side `inferCourse(slug, name)` que agrupaba
-- las `categories` en cursos hardcodeados (entradas/principales/bebidas/
-- postres). El admin ahora puede:
--   - editar nombres y orden de las supercategorías,
--   - sumar nuevas (ej "Tragos", "Para compartir"),
--   - asignar `super_category_id` a cada `category` desde el panel.
--
-- Cada business arranca con 4 supercategorías por defecto via trigger
-- `super_categories_seed_on_business`. Para businesses existentes se siembran
-- los defaults en el backfill al final del archivo, y las `categories`
-- existentes se asignan con un UPDATE que usa la misma heurística que vivía
-- en el client (regex sobre slug + name).
--
-- `super_category_id` en categories es **nullable**: una category sin super
-- cae a un bucket "Otros" en el client. No forzamos NOT NULL para no romper
-- inserts hechos antes de que el panel admin tenga el form de asignación.

create table public.super_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  -- Slug del ícono lucide en kebab-case (ej "salad", "utensils-crossed").
  -- El client mapea esto a un componente; iconos no reconocidos → fallback.
  icon text not null default 'utensils-crossed',
  -- Slug de color de tailwind (ej "lime", "orange"). El client tiene un mapa
  -- explícito para que tailwind no purge las clases dinámicas.
  color text not null default 'zinc',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

create index super_categories_business_idx
  on public.super_categories (business_id);

alter table public.super_categories enable row level security;

create policy "members_select_super_categories" on public.super_categories
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_super_categories" on public.super_categories
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "members_update_super_categories" on public.super_categories
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "members_delete_super_categories" on public.super_categories
  for delete to authenticated
  using (public.is_business_member(business_id));

-- ── FK desde categories ─────────────────────────────────────────────
alter table public.categories
  add column super_category_id uuid
  references public.super_categories(id) on delete set null;

create index categories_super_category_idx
  on public.categories (super_category_id);

-- ── Seed de defaults al crear un business ──────────────────────────
create or replace function public.ensure_default_super_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.super_categories (business_id, name, slug, sort_order, icon, color)
  values
    (new.id, 'Entradas',    'entradas',    1, 'salad',            'lime'),
    (new.id, 'Principales', 'principales', 2, 'utensils-crossed', 'orange'),
    (new.id, 'Bebidas',     'bebidas',     3, 'wine',             'sky'),
    (new.id, 'Postres',     'postres',     4, 'cake',             'pink')
  on conflict (business_id, slug) do nothing;
  return new;
end;
$$;

create trigger super_categories_seed_on_business
  after insert on public.businesses
  for each row execute function public.ensure_default_super_categories();

-- ── Backfill: businesses existentes ─────────────────────────────────
-- Sembrar los 4 defaults en cada business que aún no tiene supercategorías.
insert into public.super_categories (business_id, name, slug, sort_order, icon, color)
select b.id, d.name, d.slug, d.sort_order, d.icon, d.color
from public.businesses b
cross join (values
  ('Entradas',    'entradas',    1, 'salad',            'lime'),
  ('Principales', 'principales', 2, 'utensils-crossed', 'orange'),
  ('Bebidas',     'bebidas',     3, 'wine',             'sky'),
  ('Postres',     'postres',     4, 'cake',             'pink')
) as d(name, slug, sort_order, icon, color)
where not exists (
  select 1 from public.super_categories sc
  where sc.business_id = b.id and sc.slug = d.slug
);

-- ── Backfill: categorías existentes via heurística ─────────────────
-- Misma regex que vivía en `inferCourse` del client.
-- Default fallback = principales (la mayoría de las categorías de un
-- restaurante terminan siendo platos principales).
update public.categories c
set super_category_id = sc.id
from public.super_categories sc
where sc.business_id = c.business_id
  and c.super_category_id is null
  and sc.slug = case
    when (lower(coalesce(c.slug, '')) || ' ' || lower(coalesce(c.name, '')))
         ~ 'entrad|empanad|tapa|pica|antipas|fiamb|tabla'
      then 'entradas'
    when (lower(coalesce(c.slug, '')) || ' ' || lower(coalesce(c.name, '')))
         ~ 'bebid|cerveza|vino|gaseos|jugo|cafe|caf[eé]|infusi[oó]n|limonad|barra|trago|c[oó]ctel|agua'
      then 'bebidas'
    when (lower(coalesce(c.slug, '')) || ' ' || lower(coalesce(c.name, '')))
         ~ 'postre|helado|dulce|torta|mousse|flan|fruta'
      then 'postres'
    else 'principales'
  end;

comment on table public.super_categories is
  'Agrupador de categorías por momento de servicio (entradas/principales/bebidas/postres). Per business — el admin puede renombrar, reordenar o sumar nuevos.';

comment on column public.categories.super_category_id is
  'Supercategoría a la que pertenece. Nullable: categorías sin asignar caen a un bucket "Otros" en la UI del mozo.';
