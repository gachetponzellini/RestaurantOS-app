-- ============================================
-- Bloque 8 — Tools de reserva en el chatbot
-- ============================================
-- El bot del producto necesita poder proponer reservas y dejar que el cliente
-- las confirme en la web (mismo patrón que `cart_token` agregado en 0014).
--
-- También dejamos preparada la columna `client_confirmed_at` en `reservations`
-- para el feature futuro "el bot pregunta '¿confirmás?' 1 hora antes y el
-- cliente responde por chat". El cron que dispara esa pregunta queda para
-- otra iteración; este trabajo solo deja el campo listo para que la tool
-- `confirm_reservation` lo escriba.
--
-- Notas:
-- - `reservation_intent` JSONB guarda { date, slot, party_size, customer_name?,
--   notes? } generado por `generate_reservation_link`. Tras crear la reserva
--   en la web, el intent se limpia (= NULL) para que reabrir el link no haga
--   doble reserva.
-- - `reservation_token` queda persistido aunque el intent se consuma — sirve
--   de audit ("este token generó tal reserva").
-- - No tocamos `reservations.source` CHECK: las reservas del chatbot las
--   termina creando `createReservationFromCustomer` con el cliente logueado,
--   así que naturalmente caen como `source='web'`.
-- ============================================

alter table public.chatbot_conversations
  add column reservation_intent jsonb,
  add column reservation_token text;

create unique index chatbot_conversations_reservation_token_idx
  on public.chatbot_conversations (reservation_token)
  where reservation_token is not null;

alter table public.reservations
  add column client_confirmed_at timestamptz null;
