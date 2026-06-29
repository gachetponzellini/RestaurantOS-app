-- =============================================================
-- 0059 — AFIP: credenciales por negocio + modo fiscal + idempotencia
--
-- Cambio 13 (facturación ARCA real por negocio). Completa el delta
-- para emitir en producción multi-tenant:
--   1. Credenciales del provider (TusFacturas) POR NEGOCIO, server-only.
--      TusFacturas autentica con TRES tokens (apitoken, apikey,
--      usertoken); el CUIT emisor lo determina la credencial. El
--      certificado lo guarda TusFacturas en su panel — NO acá.
--   2. Modo fiscal explícito (sandbox | produccion) + habilitación.
--   3. Idempotencia de la emisión: una orden no genera dos
--      comprobantes vigentes; un doble click / reintento no duplica.
--
-- Ver: wiki/specs/13-facturacion-arca-afip/
-- =============================================================

-- ── 1. Credenciales + modo fiscal en businesses ─────────────────
-- SERVER-ONLY: estas columnas NUNCA se exponen al cliente ni a roles
-- no-admin. Se leen sólo vía service role (createSupabaseServiceClient).
-- Las queries de UI seleccionan flags ("hay credencial: sí/no"),
-- nunca el valor del token.

alter table public.businesses
  add column if not exists afip_provider_api_token text,
  add column if not exists afip_provider_api_key text,
  add column if not exists afip_provider_user_token text,
  add column if not exists afip_mode text not null default 'sandbox',
  add column if not exists afip_enabled boolean not null default false;

do $$ begin
  alter table public.businesses
    add constraint businesses_afip_mode_check
    check (afip_mode in ('sandbox', 'produccion'));
exception
  when duplicate_object then null;
end $$;

comment on column public.businesses.afip_provider_api_token is 'TusFacturas apitoken (alfanumérico) — SERVER-ONLY, nunca exponer al cliente';
comment on column public.businesses.afip_provider_api_key is 'TusFacturas apikey (numérico) — SERVER-ONLY, nunca exponer al cliente';
comment on column public.businesses.afip_provider_user_token is 'TusFacturas usertoken (alfanumérico) — SERVER-ONLY, nunca exponer al cliente';
comment on column public.businesses.afip_mode is 'Modo fiscal del negocio: sandbox (CAEs fake) | produccion (emisión real)';
comment on column public.businesses.afip_enabled is 'Facturación productiva habilitada — la promueve el admin con credenciales reales';

-- ── 2. Idempotencia en invoices ─────────────────────────────────
-- Patrón reservar→emitir→confirmar: el orquestador inserta una fila
-- `pending` ANTES de llamar al provider. `numero` pasa a ser nullable
-- (los pending/failed no tienen número fiscal todavía; en un índice
-- único los NULL son distintos, así no chocan con el unique de 0048
-- `(business_id, tipo_comprobante, punto_venta, numero)`, que sigue
-- garantizando correlatividad para los `authorized`).

alter table public.invoices
  alter column numero drop not null;

alter table public.invoices
  add column if not exists idempotency_key text;

-- Una orden no puede tener dos comprobantes vigentes (pending|authorized)
-- del mismo tipo: bloquea doble click y reintento duplicado a nivel DB.
create unique index if not exists invoices_order_tipo_active_uq
  on public.invoices (business_id, order_id, tipo_comprobante)
  where status in ('pending', 'authorized') and order_id is not null;

comment on column public.invoices.idempotency_key is 'Clave de idempotencia del intento (order_id + tipo); reusada en reintentos';
