-- 0009_order_items_client_line_key.sql
-- Spec 42 (idempotencia transaccional de enviarComanda).
--
-- Cada línea del carrito del mozo tiene un `_key` estable (uuid) generado al
-- agregarla al carrito. `enviarComanda` ahora lo persiste como `client_line_key`.
-- El índice UNIQUE parcial (order_id, client_line_key) hace que un doble-tap o
-- reenvío de las MISMAS líneas NO cree order_items ni comandas duplicadas: la
-- segunda inserción choca con el índice y la línea se saltea.
--
-- Un reenvío legítimo del mismo producto más tarde es OTRA línea de carrito
-- (otro `_key`) → NO se deduplica. Nullable: los otros flujos que insertan
-- order_items (público `persist-order`, walk-in, hijos de combo) no lo setean,
-- así que quedan fuera del índice parcial. Aditiva → no toca datos.

alter table "public"."order_items"
  add column if not exists "client_line_key" uuid;

comment on column "public"."order_items"."client_line_key" is
  'Idempotencia (spec 42): _key estable de la línea del carrito del mozo. El índice UNIQUE parcial (order_id, client_line_key) evita duplicar líneas/comandas por doble-submit de enviarComanda. NULL en filas de otros flujos.';

create unique index if not exists "order_items_order_client_line_key_uidx"
  on "public"."order_items" ("order_id", "client_line_key")
  where "client_line_key" is not null;
