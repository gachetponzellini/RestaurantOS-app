-- 0055: Caja de bar — venta directa sin mozo + excepción de ruteo a comanda (spec 08)

-- Mesa de barra: vende directo, abre/cierra rápido y queda fuera del motor de
-- reservas. Ortogonal a `status` (active/disabled): una barra puede estar
-- activa y, aun así, no ofrecerse para reservar.
alter table public.tables
  add column if not exists is_bar boolean not null default false;

-- Sector que expide a comanda. Default `true` = comportamiento actual (todos
-- los sectores imprimen su comanda). En la barra, bebidas/kiosco se marcan en
-- `false`; sanguchería/tostados/tocaditos quedan en `true` y sí salen a su
-- sector. La regla solo se aplica cuando la mesa es de bar (ver bar-routing.ts).
alter table public.stations
  add column if not exists routes_to_comanda boolean not null default true;

-- Lookup de mesas de barra por plano. Índice parcial: solo indexa las pocas
-- mesas con is_bar = true.
create index if not exists idx_tables_bar
  on public.tables (floor_plan_id)
  where is_bar;

-- RLS: `tables` (scope vía floor_plans.business_id) y `stations` (business_id
-- directo) ya tienen policies que cubren estas columnas nuevas. No hace falta
-- policy nueva — las columnas heredan el scope de su fila.
