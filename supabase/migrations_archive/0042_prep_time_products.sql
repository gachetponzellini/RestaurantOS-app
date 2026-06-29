-- Tiempo estimado de preparación por producto (en minutos).
-- Fuente: Maxirest tiene mxart.tiempo int(2). Habilita ETA en KDS.
alter table products
  add column prep_time_minutes smallint;

comment on column products.prep_time_minutes is
  'Estimated preparation time in minutes. NULL = not set. Used by KDS for ETA calculation.';
