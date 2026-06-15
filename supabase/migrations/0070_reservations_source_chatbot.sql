-- ============================================
-- Spec 22 — canal 'chatbot' en reservas
-- ============================================
-- Hasta ahora las reservas nacidas del handoff del chatbot caían como
-- source='web' (las terminaba creando createReservationFromCustomer con el
-- cliente logueado). Para distinguir el canal en analítica agregamos 'chatbot'
-- al CHECK. No se reescriben filas viejas: las reservas previas del bot quedan
-- contadas como 'web' (el corte por canal aplica de acá en adelante).
-- ============================================

alter table public.reservations
  drop constraint if exists reservations_source_check;

alter table public.reservations
  add constraint reservations_source_check
  check (source in ('web', 'admin', 'chatbot'));
