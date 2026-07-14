-- 0007_cobro_idempotente_transaccional.sql
-- Fix del bug crítico de doble-submit de cobro (issue #58):
--   1. Idempotency key `request_id` en payments + índice UNIQUE parcial.
--   2. RPC `registrar_pago_tx`: registra el pago de forma ATÓMICA con lock
--      FOR UPDATE sobre la orden (y el split), guardas anti-duplicado
--      (split/orden ya saldada) e insert idempotente por request_id.
-- El path del cliente sigue por src/lib/billing/cobro-actions.ts::registrarPago,
-- que ahora llama a esta función en vez de insertar directo.

-- ── 1. Idempotency key ────────────────────────────────────────────────
alter table "public"."payments"
  add column if not exists "request_id" uuid;

comment on column "public"."payments"."request_id" is
  'Idempotency key generada por el cliente por intento de cobro. El índice UNIQUE parcial (business_id, request_id) evita pagos duplicados por doble-submit / retry.';

-- UNIQUE parcial: solo aplica a filas con request_id (las viejas quedan NULL).
create unique index if not exists "payments_business_request_uidx"
  on "public"."payments" ("business_id", "request_id")
  where "request_id" is not null;

-- ── 2. RPC transaccional ──────────────────────────────────────────────
create or replace function "public"."registrar_pago_tx"(
  p_order_id           uuid,
  p_business_id        uuid,
  p_split_id           uuid,
  p_caja_id            uuid,
  p_operated_by        uuid,
  p_attributed_mozo_id uuid,
  p_method             text,
  p_amount_cents       bigint,
  p_tip_cents          bigint,
  p_last_four          text,
  p_card_brand         text,
  p_notes              text,
  p_adjustment_percent numeric,
  p_adjustment_cents   bigint,
  p_request_id         uuid
)
returns table (
  payment     jsonb,
  split_done  boolean,
  fully_paid  boolean,
  idempotent  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order         orders%rowtype;
  v_split         order_splits%rowtype;
  v_existing      payments%rowtype;
  v_payment       payments%rowtype;
  v_new_paid      bigint;
  v_split_done    boolean := false;
  v_fully_paid    boolean := false;
  v_paid_sum      bigint;
  v_active_splits int;
  v_all_paid      boolean;
begin
  -- Lock de la orden: serializa cobros concurrentes sobre la misma orden.
  select * into v_order
    from orders
    where id = p_order_id and business_id = p_business_id
    for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order.lifecycle_status <> 'open' then
    raise exception 'ORDER_CLOSED' using errcode = 'P0001';
  end if;

  -- Idempotencia: si ya existe un pago con este request_id, devolverlo sin
  -- insertar. El chequeo va bajo el lock de la orden, así que no puede
  -- interleavearse con un insert concurrente del mismo request_id.
  if p_request_id is not null then
    select * into v_existing
      from payments
      where business_id = p_business_id and request_id = p_request_id
      limit 1;
    if found then
      return query
        select to_jsonb(v_existing),
               coalesce((select s.status = 'paid' from order_splits s
                          where s.id = v_existing.split_id), false),
               false,
               true;
      return;
    end if;
  end if;

  -- Split (si aplica): lock + guardas anti-duplicado.
  if p_split_id is not null then
    select * into v_split
      from order_splits
      where id = p_split_id and business_id = p_business_id
      for update;
    if not found then
      raise exception 'SPLIT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_split.order_id <> p_order_id then
      raise exception 'SPLIT_ORDER_MISMATCH' using errcode = 'P0001';
    end if;
    if v_split.status = 'cancelled' then
      raise exception 'SPLIT_CANCELLED' using errcode = 'P0001';
    end if;
    -- Anti-duplicado: un split ya saldado no acepta más pagos.
    if v_split.paid_amount_cents >= v_split.expected_amount_cents then
      raise exception 'SPLIT_ALREADY_PAID' using errcode = 'P0001';
    end if;
  else
    -- Sin split: rechazar si la orden ya está cubierta por pagos 'paid'.
    select coalesce(sum(amount_cents), 0) into v_paid_sum
      from payments
      where order_id = p_order_id and payment_status = 'paid';
    if v_order.total_cents > 0 and v_paid_sum >= v_order.total_cents then
      raise exception 'ORDER_ALREADY_PAID' using errcode = 'P0001';
    end if;
  end if;

  -- Insert del pago. En este path el pago siempre entra 'paid'
  -- (cash / card_manual / transfer / other). MP va por otra acción.
  insert into payments (
    order_id, business_id, split_id, caja_id, operated_by, attributed_mozo_id,
    method, amount_cents, tip_cents, last_four, card_brand, payment_status,
    notes, adjustment_percent, adjustment_cents, request_id
  ) values (
    p_order_id, p_business_id, p_split_id, p_caja_id, p_operated_by, p_attributed_mozo_id,
    p_method, p_amount_cents, p_tip_cents, p_last_four, p_card_brand, 'paid',
    p_notes, coalesce(p_adjustment_percent, 0), coalesce(p_adjustment_cents, 0), p_request_id
  )
  returning * into v_payment;

  -- Update del split saldado.
  if p_split_id is not null then
    v_new_paid   := v_split.paid_amount_cents + p_amount_cents;
    v_split_done := v_new_paid >= v_split.expected_amount_cents;
    update order_splits
      set paid_amount_cents = v_new_paid,
          status = case when v_split_done then 'paid' else 'pending' end
      where id = p_split_id;
  end if;

  -- ¿Orden completamente paga? (misma lógica que closeOrderIfFullyPaid:
  -- el cierre + liberación de mesa lo hace el caller en TS, guardado por
  -- lifecycle_status, para no duplicar esa lógica en SQL.)
  select coalesce(sum(amount_cents), 0) into v_paid_sum
    from payments
    where order_id = p_order_id and payment_status = 'paid';
  select count(*) into v_active_splits
    from order_splits
    where order_id = p_order_id and status <> 'cancelled';
  if v_active_splits = 0 then
    v_fully_paid := v_paid_sum >= v_order.total_cents and v_order.total_cents > 0;
  else
    select bool_and(paid_amount_cents >= expected_amount_cents) into v_all_paid
      from order_splits
      where order_id = p_order_id and status <> 'cancelled';
    v_fully_paid := coalesce(v_all_paid, false);
  end if;

  return query select to_jsonb(v_payment), v_split_done, v_fully_paid, false;
end;
$$;

-- Solo el service_role (server actions) puede ejecutarla. Cerramos el hueco
-- de SECURITY DEFINER ejecutable por anon/authenticated (lección migración 0004).
revoke all on function "public"."registrar_pago_tx"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, text, text, text, numeric, bigint, uuid
) from public, anon, authenticated;

grant execute on function "public"."registrar_pago_tx"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, text, text, text, numeric, bigint, uuid
) to service_role;
