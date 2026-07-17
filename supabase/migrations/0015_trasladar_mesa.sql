-- 0015_trasladar_mesa.sql
-- Spec 048 — Trasladar una mesa completa a otra mesa (Fase 1: destino libre).
--   1. Amplía el CHECK de tables_audit_log.kind con 'move'.
--   2. RPC `trasladar_mesa_tx`: mueve la orden abierta de una mesa A a una mesa
--      B *libre* de forma ATÓMICA (repunteo de orders.table_id + swap de las dos
--      mesas + reserva seated + audit), con lock FOR UPDATE sobre la orden.
--      Como todo (order_items, comandas, payments, splits) cuelga de order_id,
--      el contenido y la plata viajan solos: no se reescribe nada de eso.
-- El path del cliente va por src/lib/mozo/actions.ts::trasladarMesa (service role).

-- ── 1. Audit log: nuevo kind 'move' ───────────────────────────────────
alter table "public"."tables_audit_log"
  drop constraint if exists "tables_audit_log_kind_check";

alter table "public"."tables_audit_log"
  add constraint "tables_audit_log_kind_check"
  check ("kind" in ('assignment', 'status', 'transfer', 'move'));

-- ── 2. RPC transaccional ──────────────────────────────────────────────
create or replace function "public"."trasladar_mesa_tx"(
  p_business_id       uuid,
  p_from_table_id     uuid,
  p_to_table_id       uuid,
  p_expected_order_id uuid,
  p_actor_user_id     uuid,
  p_reason            text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order          orders%rowtype;
  v_from_biz       uuid;
  v_to_biz         uuid;
  v_from_opened_at timestamptz;
  v_from_mozo      uuid;
  v_new_status     text;
begin
  -- Trasladar a la misma mesa no tiene sentido.
  if p_from_table_id = p_to_table_id then
    raise exception 'SAME_TABLE' using errcode = 'P0001';
  end if;

  -- Cross-tenant: ambas mesas deben pertenecer al business (tables no tiene
  -- business_id directo, va via floor_plans).
  select fp.business_id into v_from_biz
    from tables t join floor_plans fp on fp.id = t.floor_plan_id
    where t.id = p_from_table_id;
  if v_from_biz is null or v_from_biz <> p_business_id then
    raise exception 'CROSS_TENANT' using errcode = 'P0001';
  end if;

  select fp.business_id into v_to_biz
    from tables t join floor_plans fp on fp.id = t.floor_plan_id
    where t.id = p_to_table_id;
  if v_to_biz is null or v_to_biz <> p_business_id then
    raise exception 'CROSS_TENANT' using errcode = 'P0001';
  end if;

  -- Lock de la orden abierta de la mesa origen: serializa contra cobros
  -- concurrentes (registrar_pago_tx también lockea la orden FOR UPDATE).
  select * into v_order
    from orders
    where table_id = p_from_table_id
      and business_id = p_business_id
      and lifecycle_status = 'open'
    for update;
  if not found then
    raise exception 'NO_OPEN_ORDER' using errcode = 'P0002';
  end if;

  -- Anti doble-tap / estado corrido: la orden abierta de A no es la que la UI
  -- creía mover (ej: se sentó un cover nuevo, o el botón se tocó dos veces).
  if v_order.id <> p_expected_order_id then
    raise exception 'STALE_STATE' using errcode = 'P0001';
  end if;

  -- Pre-check amable de destino ocupado. El garante REAL es el índice parcial
  -- orders_one_open_per_table + el catch de unique_violation de abajo (cierra
  -- el TOCTOU contra un enviarComanda(B) que se cuele entre acá y el update).
  if exists (
    select 1 from orders
    where table_id = p_to_table_id
      and business_id = p_business_id
      and lifecycle_status = 'open'
  ) then
    raise exception 'DESTINATION_OCCUPIED' using errcode = 'P0001';
  end if;

  -- Datos de la mesa origen que viajan con el grupo.
  select operational_status, opened_at, mozo_id
    into v_new_status, v_from_opened_at, v_from_mozo
    from tables where id = p_from_table_id;

  -- Repunteo de la orden A→B. Único cambio que arrastra items/comandas/pagos a
  -- la mesa nueva (todo cuelga de order_id). Si un insert concurrente ocupó B,
  -- el unique_violation se traduce a DESTINATION_OCCUPIED con rollback atómico.
  begin
    update orders set table_id = p_to_table_id where id = v_order.id;
  exception when unique_violation then
    raise exception 'DESTINATION_OCCUPIED' using errcode = 'P0001';
  end;

  -- Estado destino: hereda 'pidio_cuenta' si el grupo ya había pedido la cuenta.
  v_new_status := case
    when v_order.bill_requested_at is not null then 'pidio_cuenta'
    else 'ocupada'
  end;

  -- Liberar mesa origen — SIN cancelar la orden (diferencia clave con liberarMesa).
  update tables
    set operational_status = 'libre',
        current_order_id = null,
        opened_at = null,
        mozo_id = null
    where id = p_from_table_id;

  -- Ocupar mesa destino, heredando el reloj (opened_at) y el mozo de la origen.
  update tables
    set operational_status = v_new_status,
        current_order_id = v_order.id,
        opened_at = v_from_opened_at,
        mozo_id = v_from_mozo
    where id = p_to_table_id;

  -- La reserva seated del grupo se muda con ellos.
  update reservations
    set table_id = p_to_table_id
    where table_id = p_from_table_id
      and business_id = p_business_id
      and status = 'seated';

  -- Audit ×2 (una fila por mesa; from=origen, to=destino en ambas).
  insert into tables_audit_log
    (table_id, business_id, kind, from_value, to_value, by_user_id, reason)
  values
    (p_from_table_id, p_business_id, 'move', p_from_table_id::text, p_to_table_id::text, p_actor_user_id, p_reason),
    (p_to_table_id,   p_business_id, 'move', p_from_table_id::text, p_to_table_id::text, p_actor_user_id, p_reason);

  return v_order.id;
end;
$$;

-- Solo el service_role (server actions) puede ejecutarla. Cerramos el hueco de
-- SECURITY DEFINER ejecutable por anon/authenticated (lección migración 0004):
-- toda la autorización de rol (encargado/admin) vive en la server action TS.
revoke all on function "public"."trasladar_mesa_tx"(
  uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function "public"."trasladar_mesa_tx"(
  uuid, uuid, uuid, uuid, uuid, text
) to service_role;
