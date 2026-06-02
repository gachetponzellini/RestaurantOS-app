-- 0052 · daily_menus: display_context + is_suggestion
-- Spec 01 — Carta digital del cliente
--
-- display_context controla en qué superficie se muestra un menú del día:
--   delivery = sólo carta pública (cliente online)
--   salon    = sólo operación de salón (mozo)
--   both     = ambas (default, preserva comportamiento actual)
--
-- is_suggestion marca un menú del día como "sugerencia del día" (badge UI).
-- No requiere policies RLS nuevas: hereda las de 0017_daily_menus.sql.

alter table public.daily_menus
  add column display_context text not null default 'both'
    check (display_context in ('delivery', 'salon', 'both'));

alter table public.daily_menus
  add column is_suggestion boolean not null default false;

comment on column public.daily_menus.display_context is
  'Superficie de visualización: delivery (carta pública), salon (mozo), both (ambas).';

comment on column public.daily_menus.is_suggestion is
  'true = sugerencia del día (badge "Sugerencia" en la carta), false = menú del día normal.';
