-- ============================================
-- Mercado Pago Checkout Pro integration.
--
-- Multi-tenant: each business connects its own MP application. Credentials
-- are stored per-business so payments land in the merchant's account.
--
-- - mp_access_token   : APP_USR-* credential used server-side for API calls
-- - mp_public_key     : APP_USR-* public key (unused for Checkout Pro but
--                        kept for future Bricks / Payment Brick flows)
-- - mp_webhook_secret : HMAC secret from the app's webhook config; used to
--                        verify x-signature headers on notifications
-- - mp_accepts_payments : on/off switch independent of credentials, so a
--                        business can temporarily disable MP without losing
--                        their keys
--
-- On orders we snapshot the preference id (debugging / idempotency) and the
-- payment id once a payment is approved — both useful for reconciliation.
-- ============================================

alter table businesses
  add column mp_access_token text,
  add column mp_public_key text,
  add column mp_webhook_secret text,
  add column mp_accepts_payments boolean not null default false;

alter table orders
  add column mp_preference_id text,
  add column mp_payment_id text;

-- Narrow partial indexes for fast webhook lookup / reconciliation.
create index orders_mp_payment_id_idx
  on orders (mp_payment_id)
  where mp_payment_id is not null;

create index orders_mp_preference_id_idx
  on orders (mp_preference_id)
  where mp_preference_id is not null;
