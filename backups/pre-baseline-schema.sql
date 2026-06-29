


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."ensure_default_super_categories"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.super_categories (business_id, name, slug, sort_order, icon, color)
  values
    (new.id, 'Entradas',    'entradas',    1, 'salad',            'lime'),
    (new.id, 'Principales', 'principales', 2, 'utensils-crossed', 'orange'),
    (new.id, 'Bebidas',     'bebidas',     3, 'wine',             'sky'),
    (new.id, 'Postres',     'postres',     4, 'cake',             'pink')
  on conflict (business_id, slug) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_default_super_categories"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_explode_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric) RETURNS TABLE("leaf_ingredient_id" "uuid", "leaf_quantity" numeric, "leaf_cost_per_unit" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  v_composite boolean;
  v_cost numeric;
  r record;
begin
  select is_composite into v_composite
    from ingredients where id = p_ingredient_id;

  if not v_composite then
    -- Hoja: retornar directamente
    leaf_ingredient_id := p_ingredient_id;
    leaf_quantity := p_quantity;
    leaf_cost_per_unit := fn_ingredient_cost_per_unit(p_ingredient_id);
    return next;
    return;
  end if;

  -- Compuesto: explotar hijos
  for r in
    select ir.child_ingredient_id, ir.quantity
    from ingredient_recipes ir
    where ir.parent_ingredient_id = p_ingredient_id
  loop
    return query
      select * from fn_explode_ingredient(r.child_ingredient_id, p_quantity * r.quantity);
  end loop;

  return;
end;
$$;


ALTER FUNCTION "public"."fn_explode_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ingredient_cost_per_unit"("p_ingredient_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  v_composite boolean;
  v_cost numeric;
  v_waste numeric;
  r record;
begin
  select is_composite, waste_percent
    into v_composite, v_waste
    from ingredients where id = p_ingredient_id;

  if not v_composite then
    -- Ingrediente simple: costo de presentación default
    select case when ip.net_quantity > 0
                then ip.cost_cents::numeric / ip.net_quantity
                else 0 end
      into v_cost
      from ingredient_presentations ip
      where ip.ingredient_id = p_ingredient_id
        and ip.is_default = true
      limit 1;
    return coalesce(v_cost, 0);
  end if;

  -- Ingrediente compuesto: sumar costos de hijos × cantidad × (1 + waste/100)
  v_cost := 0;
  for r in
    select ir.child_ingredient_id, ir.quantity,
           i.waste_percent as child_waste
    from ingredient_recipes ir
    join ingredients i on i.id = ir.child_ingredient_id
    where ir.parent_ingredient_id = p_ingredient_id
  loop
    v_cost := v_cost + (
      fn_ingredient_cost_per_unit(r.child_ingredient_id)
      * r.quantity
      * (1 + r.child_waste / 100)
    );
  end loop;

  return v_cost;
end;
$$;


ALTER FUNCTION "public"."fn_ingredient_cost_per_unit"("p_ingredient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ingredient_price_change_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  if old.cost_cents is distinct from new.cost_cents then
    insert into ingredient_price_log (ingredient_id, presentation_id, old_cost_cents, new_cost_cents, recorded_by)
    values (new.ingredient_id, new.id, old.cost_cents, new.cost_cents, auth.uid());
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_ingredient_price_change_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_recipe_stock_descuento"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  r record;
  leaf record;
  v_business_id uuid;
begin
  -- Skip si el producto ya tiene track_stock (manejado por trg_stock_descuento)
  if exists (select 1 from products where id = new.product_id and track_stock = true) then
    return new;
  end if;

  -- Obtener business_id del pedido
  select o.business_id into v_business_id
    from orders o
    join order_items oi on oi.order_id = o.id
    where oi.id = new.id
    limit 1;

  -- Recorrer cada ingrediente de la receta
  for r in
    select rec.ingredient_id, rec.quantity
    from recipes rec
    where rec.product_id = new.product_id
  loop
    -- Explotar sub-recetas: obtener ingredientes hoja
    for leaf in
      select * from fn_explode_ingredient(r.ingredient_id, r.quantity * new.quantity)
    loop
      -- Descontar stock del ingrediente hoja
      update ingredients
        set stock_quantity = stock_quantity - leaf.leaf_quantity,
            updated_at = now()
        where id = leaf.leaf_ingredient_id;

      -- Loguear consumo
      insert into ingredient_consumptions
        (business_id, ingredient_id, order_item_id, quantity, cost_cents_snapshot, kind)
      values (
        v_business_id,
        leaf.leaf_ingredient_id,
        new.id,
        leaf.leaf_quantity,
        round(leaf.leaf_cost_per_unit * leaf.leaf_quantity)::integer,
        'venta'
      );
    end loop;
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_recipe_stock_descuento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_recipe_stock_reversion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  item record;
  r record;
  leaf record;
begin
  -- Solo actuar si el status cambió a 'cancelled'
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    -- Para cada item del pedido
    for item in
      select oi.id as item_id, oi.product_id, oi.quantity
      from order_items oi
      where oi.order_id = new.id
    loop
      -- Skip productos con track_stock (tienen su propio sistema)
      if exists (select 1 from products where id = item.product_id and track_stock = true) then
        continue;
      end if;

      -- Para cada ingrediente de la receta
      for r in
        select rec.ingredient_id, rec.quantity
        from recipes rec
        where rec.product_id = item.product_id
      loop
        -- Explotar sub-recetas
        for leaf in
          select * from fn_explode_ingredient(r.ingredient_id, r.quantity * item.quantity)
        loop
          -- Revertir stock
          update ingredients
            set stock_quantity = stock_quantity + leaf.leaf_quantity,
                updated_at = now()
            where id = leaf.leaf_ingredient_id;

          -- Loguear reversión
          insert into ingredient_consumptions
            (business_id, ingredient_id, order_item_id, quantity, cost_cents_snapshot, kind)
          values (
            new.business_id,
            leaf.leaf_ingredient_id,
            item.item_id,
            leaf.leaf_quantity,
            0,
            'reversion'
          );
        end loop;
      end loop;
    end loop;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_recipe_stock_reversion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_stock_descuento_on_order_item"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  v_stock_item_id uuid;
  v_business_id uuid;
begin
  if not exists (select 1 from products where id = new.product_id and track_stock = true) then
    return new;
  end if;

  select si.id, si.business_id into v_stock_item_id, v_business_id
    from stock_items si where si.product_id = new.product_id;

  if v_stock_item_id is null then
    return new;
  end if;

  update stock_items
    set current_qty = current_qty - new.quantity,
        updated_at = now()
    where id = v_stock_item_id;

  insert into stock_movimientos (stock_item_id, business_id, kind, qty, order_item_id)
    values (v_stock_item_id, v_business_id, 'venta', -new.quantity, new.id);

  if (select current_qty from stock_items where id = v_stock_item_id) <= 0 then
    update products set is_available = false where id = new.product_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_stock_descuento_on_order_item"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_promo_use"("p_promo_id" "uuid", "p_business_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  updated_count int;
begin
  update public.promo_codes
     set uses_count = uses_count + 1
   where id = p_promo_id
     and business_id = p_business_id
     and is_active = true
     and (max_uses is null or uses_count < max_uses)
     and (valid_from is null or valid_from <= now())
     and (valid_until is null or valid_until >= now());

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;


ALTER FUNCTION "public"."increment_promo_use"("p_promo_id" "uuid", "p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_business_member"("bid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1 from public.business_users
    where business_id = bid and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_business_member"("bid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_business_staff"("bid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1 from public.business_users
    where business_id = bid
      and user_id = auth.uid()
      and role in ('admin', 'encargado', 'mozo')
      and disabled_at is null
  );
$$;


ALTER FUNCTION "public"."is_business_staff"("bid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select coalesce(
    (select is_platform_admin from public.users where id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_order_initial_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  insert into order_status_history (order_id, status)
  values (new.id, new.status);
  return new;
end;
$$;


ALTER FUNCTION "public"."log_order_initial_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_order_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  if new.status is distinct from old.status then
    insert into order_status_history (order_id, status, notes)
    values (new.id, new.status, new.cancelled_reason);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."log_order_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_campaign_message_redeemed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.promo_code_id is not null then
    update public.campaign_messages
       set redeemed_at = coalesce(redeemed_at, now()),
           redeemed_order_id = coalesce(redeemed_order_id, NEW.id)
     where promo_code_id = NEW.promo_code_id
       and customer_id = NEW.customer_id
       and redeemed_at is null;

    -- Bump campaign counter (best-effort — no error if 0 rows match)
    update public.campaigns
       set redeemed_count = redeemed_count + 1
     where id in (
       select campaign_id
         from public.campaign_messages
        where promo_code_id = NEW.promo_code_id
          and customer_id = NEW.customer_id
     );
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."mark_campaign_message_redeemed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_overdue_reservations_no_show"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with upd as (
    update public.reservations r
    set status = 'no_show'
    where r.status = 'confirmed'
      and r.starts_at + make_interval(mins => coalesce(
            (select s.no_show_grace_min
               from public.reservation_settings s
              where s.business_id = r.business_id),
            30)) < now()
    returning 1
  )
  select count(*)::int from upd;
$$;


ALTER FUNCTION "public"."mark_overdue_reservations_no_show"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  lock_key bigint;
begin
  if new.order_number is null or new.order_number = 0 then
    lock_key := hashtextextended(new.business_id::text, 0);
    perform pg_advisory_xact_lock(lock_key);

    select coalesce(max(order_number), 0) + 1
    into new.order_number
    from orders
    where business_id = new.business_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_order_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."business_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "opens_at" time without time zone NOT NULL,
    "closes_at" time without time zone NOT NULL,
    CONSTRAINT "business_hours_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."business_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_users" (
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "disabled_at" timestamp with time zone,
    "full_name" "text",
    "phone" "text",
    "pin" character(4),
    CONSTRAINT "business_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'encargado'::"text", 'mozo'::"text", 'personal'::"text"])))
);


ALTER TABLE "public"."business_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "timezone" "text" DEFAULT 'America/Argentina/Buenos_Aires'::"text" NOT NULL,
    "currency" "text" DEFAULT 'ARS'::"text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "lat" numeric(10,7),
    "lng" numeric(10,7),
    "logo_url" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "plan" "text" DEFAULT 'basic'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_image_url" "text",
    "delivery_fee_cents" bigint DEFAULT 0 NOT NULL,
    "min_order_cents" bigint DEFAULT 0 NOT NULL,
    "estimated_delivery_minutes" integer,
    "mp_access_token" "text",
    "mp_public_key" "text",
    "mp_webhook_secret" "text",
    "mp_accepts_payments" boolean DEFAULT false NOT NULL,
    "afip_cuit" "text",
    "afip_punto_venta" integer,
    "afip_provider" "text" DEFAULT 'tusfacturas'::"text",
    "afip_default_tipo" "text" DEFAULT 'factura_b'::"text",
    "afip_provider_api_token" "text",
    "afip_provider_api_key" "text",
    "afip_provider_user_token" "text",
    "afip_mode" "text" DEFAULT 'sandbox'::"text" NOT NULL,
    "afip_enabled" boolean DEFAULT false NOT NULL,
    "whatsapp_connected" boolean DEFAULT false NOT NULL,
    CONSTRAINT "businesses_afip_mode_check" CHECK (("afip_mode" = ANY (ARRAY['sandbox'::"text", 'produccion'::"text"])))
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."businesses"."afip_cuit" IS 'CUIT del negocio para facturación AFIP/ARCA';



COMMENT ON COLUMN "public"."businesses"."afip_punto_venta" IS 'Punto de venta AFIP asignado a este sistema';



COMMENT ON COLUMN "public"."businesses"."afip_provider" IS 'Provider de facturación: tusfacturas, afipsdk, direct';



COMMENT ON COLUMN "public"."businesses"."afip_default_tipo" IS 'Tipo de comprobante por defecto (factura_b para consumidor final)';



COMMENT ON COLUMN "public"."businesses"."afip_provider_api_token" IS 'TusFacturas apitoken (alfanumérico) — SERVER-ONLY, nunca exponer al cliente';



COMMENT ON COLUMN "public"."businesses"."afip_provider_api_key" IS 'TusFacturas apikey (numérico) — SERVER-ONLY, nunca exponer al cliente';



COMMENT ON COLUMN "public"."businesses"."afip_provider_user_token" IS 'TusFacturas usertoken (alfanumérico) — SERVER-ONLY, nunca exponer al cliente';



COMMENT ON COLUMN "public"."businesses"."afip_mode" IS 'Modo fiscal del negocio: sandbox (CAEs fake) | produccion (emisión real)';



COMMENT ON COLUMN "public"."businesses"."afip_enabled" IS 'Facturación productiva habilitada — la promueve el admin con credenciales reales';



CREATE TABLE IF NOT EXISTS "public"."caja_cortes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "caja_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "encargado_id" "uuid" NOT NULL,
    "expected_cash_cents" bigint NOT NULL,
    "closing_cash_cents" bigint NOT NULL,
    "difference_cents" bigint NOT NULL,
    "closing_notes" "text",
    "denomination_count" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "caja_cortes_closing_cash_cents_check" CHECK (("closing_cash_cents" >= 0))
);


ALTER TABLE "public"."caja_cortes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."caja_movimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "caja_id" "uuid" NOT NULL,
    CONSTRAINT "caja_movimientos_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "caja_movimientos_kind_check" CHECK (("kind" = ANY (ARRAY['sangria'::"text", 'ingreso'::"text"])))
);


ALTER TABLE "public"."caja_movimientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."caja_user_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "caja_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."caja_user_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cajas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cajas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "customer_name" "text",
    "rendered_message" "text" NOT NULL,
    "promo_code_id" "uuid",
    "promo_code_text" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "redeemed_at" timestamp with time zone,
    "redeemed_order_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_messages_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."campaign_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "audience_type" "text" DEFAULT 'segment'::"text" NOT NULL,
    "audience_segment" "text",
    "audience_customer_ids" "uuid"[],
    "promo_template" "jsonb" NOT NULL,
    "message_template" "text" NOT NULL,
    "channel" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "audience_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "redeemed_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "launched_at" timestamp with time zone,
    CONSTRAINT "campaigns_audience_segment_check" CHECK ((("audience_segment" IS NULL) OR ("audience_segment" = ANY (ARRAY['new'::"text", 'frequent'::"text", 'top'::"text", 'inactive'::"text", 'lost'::"text", 'regular'::"text"])))),
    CONSTRAINT "campaigns_audience_type_check" CHECK (("audience_type" = ANY (ARRAY['segment'::"text", 'all'::"text", 'manual'::"text"]))),
    CONSTRAINT "campaigns_channel_check" CHECK (("channel" = ANY (ARRAY['manual'::"text", 'waba'::"text"]))),
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sending'::"text", 'sent'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "station_id" "uuid",
    "super_category_id" "uuid"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."categories"."super_category_id" IS 'Supercategoría a la que pertenece. Nullable: categorías sin asignar caen a un bucket "Otros" en la UI del mozo.';



CREATE TABLE IF NOT EXISTS "public"."chatbot_configs" (
    "business_id" "uuid" NOT NULL,
    "system_prompt" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enabled_tools" "text"[],
    "tool_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "chatbot_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."chatbot_configs" OWNER TO "postgres";


COMMENT ON TABLE "public"."chatbot_configs" IS 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';



CREATE TABLE IF NOT EXISTS "public"."chatbot_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "identifier" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chatbot_contacts_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'web-test'::"text"])))
);


ALTER TABLE "public"."chatbot_contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."chatbot_contacts" IS 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';



CREATE TABLE IF NOT EXISTS "public"."chatbot_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cart_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "cart_token" "text",
    "reservation_intent" "jsonb",
    "reservation_token" "text"
);


ALTER TABLE "public"."chatbot_conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."chatbot_conversations" IS 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';



CREATE TABLE IF NOT EXISTS "public"."chatbot_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chatbot_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."chatbot_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."chatbot_messages" IS 'service-role-only (spec 19 · DT-018): accedida solo vía createSupabaseServiceClient. RLS on sin policies = deniega anon/authenticated a propósito.';



CREATE TABLE IF NOT EXISTS "public"."clock_allowed_origins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "cidr" "text" NOT NULL,
    "label" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clock_allowed_origins" OWNER TO "postgres";


COMMENT ON TABLE "public"."clock_allowed_origins" IS 'Orígenes (IP/CIDR de la LAN del local) habilitados para fichar, por negocio. Vacío = sin enforcement.';



COMMENT ON COLUMN "public"."clock_allowed_origins"."cidr" IS 'IPv4 en notación CIDR (ej: 192.168.10.0/24) o IP suelta (ej: 192.168.10.42 = /32).';



CREATE TABLE IF NOT EXISTS "public"."clock_blocked_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "ip" "text",
    "pin_masked" "text",
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clock_blocked_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."clock_blocked_attempts" IS 'Intentos de fichada rechazados por origen no autorizado (spec 11). PIN siempre enmascarado.';



COMMENT ON COLUMN "public"."clock_blocked_attempts"."pin_masked" IS 'PIN enmascarado (ej: 1**4); nunca el PIN en claro.';



CREATE TABLE IF NOT EXISTS "public"."clock_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clock_in" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clock_out" timestamp with time zone,
    "duration_minutes" integer GENERATED ALWAYS AS (
CASE
    WHEN ("clock_out" IS NOT NULL) THEN ((EXTRACT(epoch FROM ("clock_out" - "clock_in")))::integer / 60)
    ELSE NULL::integer
END) STORED,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clock_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comanda_items" (
    "comanda_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL
);


ALTER TABLE "public"."comanda_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comandas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "batch" integer NOT NULL,
    "status" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "emitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    CONSTRAINT "comandas_batch_check" CHECK (("batch" > 0)),
    CONSTRAINT "comandas_status_check" CHECK (("status" = ANY (ARRAY['pendiente'::"text", 'en_preparacion'::"text", 'entregado'::"text"])))
);


ALTER TABLE "public"."comandas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "label" "text",
    "street" "text" NOT NULL,
    "number" "text",
    "apartment" "text",
    "notes" "text",
    "lat" numeric(10,7),
    "lng" numeric(10,7),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "phone" "text" NOT NULL,
    "name" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_menu_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "kind" "text" DEFAULT 'text'::"text" NOT NULL,
    "product_id" "uuid",
    "choice_group_id" "uuid",
    "choice_group_label" "text",
    CONSTRAINT "daily_menu_components_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'product'::"text", 'choice'::"text"]))),
    CONSTRAINT "daily_menu_components_kind_coherent" CHECK (((("kind" = 'text'::"text") AND ("product_id" IS NULL) AND ("choice_group_id" IS NULL)) OR (("kind" = 'product'::"text") AND ("product_id" IS NOT NULL)) OR (("kind" = 'choice'::"text") AND ("choice_group_id" IS NOT NULL) AND ("product_id" IS NOT NULL))))
);


ALTER TABLE "public"."daily_menu_components" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "price_cents" bigint NOT NULL,
    "image_url" "text",
    "available_days" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_context" "text" DEFAULT 'both'::"text" NOT NULL,
    "is_suggestion" boolean DEFAULT false NOT NULL,
    CONSTRAINT "daily_menus_available_days_check" CHECK (("available_days" <@ ARRAY[0, 1, 2, 3, 4, 5, 6])),
    CONSTRAINT "daily_menus_display_context_check" CHECK (("display_context" = ANY (ARRAY['delivery'::"text", 'salon'::"text", 'both'::"text"]))),
    CONSTRAINT "daily_menus_price_cents_check" CHECK (("price_cents" >= 0))
);


ALTER TABLE "public"."daily_menus" OWNER TO "postgres";


COMMENT ON COLUMN "public"."daily_menus"."display_context" IS 'Superficie de visualización: delivery (carta pública), salon (mozo), both (ambas).';



COMMENT ON COLUMN "public"."daily_menus"."is_suggestion" IS 'true = sugerencia del día (badge "Sugerencia" en la carta), false = menú del día normal.';



CREATE TABLE IF NOT EXISTS "public"."delivery_message_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "body" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_name" "text",
    "template_lang" "text" DEFAULT 'es_AR'::"text" NOT NULL,
    "template_params" "jsonb",
    CONSTRAINT "delivery_message_templates_status_check" CHECK (("status" = ANY (ARRAY['preparing'::"text", 'ready'::"text", 'on_the_way'::"text", 'delivered'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."delivery_message_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."floor_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Salón'::"text" NOT NULL,
    "width" integer DEFAULT 1000 NOT NULL,
    "height" integer DEFAULT 700 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "background_image_url" "text",
    "background_opacity" integer DEFAULT 60 NOT NULL,
    CONSTRAINT "floor_plans_background_opacity_check" CHECK ((("background_opacity" >= 0) AND ("background_opacity" <= 100))),
    CONSTRAINT "floor_plans_height_check" CHECK (("height" > 0)),
    CONSTRAINT "floor_plans_width_check" CHECK (("width" > 0))
);


ALTER TABLE "public"."floor_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredient_consumptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "order_item_id" "uuid",
    "quantity" numeric(12,4) NOT NULL,
    "cost_cents_snapshot" integer DEFAULT 0 NOT NULL,
    "kind" "text" DEFAULT 'venta'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ingredient_consumptions_kind_check" CHECK (("kind" = ANY (ARRAY['venta'::"text", 'reversion'::"text", 'ajuste'::"text", 'merma'::"text", 'compra'::"text"])))
);


ALTER TABLE "public"."ingredient_consumptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredient_presentations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "net_quantity" numeric(12,3) NOT NULL,
    "cost_cents" integer DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ingredient_presentations_cost_cents_check" CHECK (("cost_cents" >= 0)),
    CONSTRAINT "ingredient_presentations_net_quantity_check" CHECK (("net_quantity" > (0)::numeric))
);


ALTER TABLE "public"."ingredient_presentations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredient_price_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "presentation_id" "uuid",
    "old_cost_cents" integer NOT NULL,
    "new_cost_cents" integer NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by" "uuid"
);


ALTER TABLE "public"."ingredient_price_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredient_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_ingredient_id" "uuid" NOT NULL,
    "child_ingredient_id" "uuid" NOT NULL,
    "quantity" numeric(12,4) NOT NULL,
    "notes" "text",
    CONSTRAINT "ingredient_recipes_no_self_ref" CHECK (("parent_ingredient_id" <> "child_ingredient_id")),
    CONSTRAINT "ingredient_recipes_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."ingredient_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "waste_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "stock_quantity" numeric(12,3) DEFAULT 0 NOT NULL,
    "stock_min_alert" numeric(12,3),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_composite" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ingredients_unit_check" CHECK (("unit" = ANY (ARRAY['kg'::"text", 'lt'::"text", 'un'::"text", 'g'::"text", 'ml'::"text"]))),
    CONSTRAINT "ingredients_waste_percent_check" CHECK ((("waste_percent" >= (0)::numeric) AND ("waste_percent" < (100)::numeric)))
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "payment_id" "uuid",
    "tipo_comprobante" "text" NOT NULL,
    "punto_venta" integer NOT NULL,
    "numero" integer,
    "cae" "text",
    "cae_vencimiento" "date",
    "cuit_receptor" "text",
    "razon_social_receptor" "text",
    "total_cents" bigint NOT NULL,
    "neto_cents" bigint NOT NULL,
    "iva_cents" bigint NOT NULL,
    "iva_rate" numeric(5,2) DEFAULT 21.00 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "pdf_url" "text",
    "provider" "text" DEFAULT 'tusfacturas'::"text" NOT NULL,
    "provider_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text",
    "cancelled_reason" "text",
    "cancels_invoice_id" "uuid",
    CONSTRAINT "invoices_iva_cents_check" CHECK (("iva_cents" >= 0)),
    CONSTRAINT "invoices_neto_cents_check" CHECK (("neto_cents" >= 0)),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'authorized'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "invoices_tipo_comprobante_check" CHECK (("tipo_comprobante" = ANY (ARRAY['factura_a'::"text", 'factura_b'::"text", 'nota_credito_a'::"text", 'nota_credito_b'::"text"]))),
    CONSTRAINT "invoices_total_cents_check" CHECK (("total_cents" >= 0))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


COMMENT ON COLUMN "public"."invoices"."idempotency_key" IS 'Clave de idempotencia del intento (order_id + tipo); reusada en reintentos';



COMMENT ON COLUMN "public"."invoices"."cancelled_reason" IS 'Motivo de anulación (obligatorio al anular un comprobante autorizado vía nota de crédito)';



COMMENT ON COLUMN "public"."invoices"."cancels_invoice_id" IS 'Si la fila es una nota de crédito, apunta a la factura original que anula';



CREATE TABLE IF NOT EXISTS "public"."modifier_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_selection" integer DEFAULT 0 NOT NULL,
    "max_selection" integer DEFAULT 1 NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."modifier_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price_delta_cents" bigint DEFAULT 0 NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mozo_rendiciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "mozo_id" "uuid" NOT NULL,
    "registered_by" "uuid" NOT NULL,
    "expected_cash_cents" bigint DEFAULT 0 NOT NULL,
    "delivered_cash_cents" bigint DEFAULT 0 NOT NULL,
    "difference_cents" bigint DEFAULT 0 NOT NULL,
    "notes" "text",
    "por_metodo" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mozo_rendiciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "target_role" "text",
    "target_user_id" "uuid",
    "channel" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_preferences_channel_check" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "notification_preferences_target_role_check" CHECK (("target_role" = ANY (ARRAY['admin'::"text", 'encargado'::"text", 'mozo'::"text"]))),
    CONSTRAINT "notification_prefs_target_check" CHECK ((("target_role" IS NOT NULL) OR ("target_user_id" IS NOT NULL)))
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "target_role" "text",
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_target_check" CHECK ((("user_id" IS NOT NULL) OR ("target_role" IS NOT NULL))),
    CONSTRAINT "notifications_target_role_check" CHECK (("target_role" = ANY (ARRAY['admin'::"text", 'encargado'::"text", 'mozo'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_item_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "modifier_id" "uuid",
    "modifier_name" "text" NOT NULL,
    "price_delta_cents" bigint NOT NULL
);


ALTER TABLE "public"."order_item_modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_name" "text" NOT NULL,
    "unit_price_cents" bigint NOT NULL,
    "quantity" integer NOT NULL,
    "notes" "text",
    "subtotal_cents" bigint NOT NULL,
    "daily_menu_id" "uuid",
    "daily_menu_snapshot" "jsonb",
    "kitchen_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "station_id" "uuid",
    "loaded_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_reason" "text",
    "parent_order_item_id" "uuid",
    "is_combo_component" boolean DEFAULT false NOT NULL,
    "seat_number" integer,
    CONSTRAINT "order_items_kitchen_status_check" CHECK (("kitchen_status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text", 'delivered'::"text"]))),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_seat_number_check" CHECK ((("seat_number" IS NULL) OR ("seat_number" >= 1)))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_split_items" (
    "split_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL
);


ALTER TABLE "public"."order_split_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "split_mode" "text" NOT NULL,
    "split_index" integer NOT NULL,
    "expected_amount_cents" bigint NOT NULL,
    "paid_amount_cents" bigint DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_splits_expected_amount_cents_check" CHECK (("expected_amount_cents" >= 0)),
    CONSTRAINT "order_splits_paid_amount_cents_check" CHECK (("paid_amount_cents" >= 0)),
    CONSTRAINT "order_splits_split_mode_check" CHECK (("split_mode" = ANY (ARRAY['por_personas'::"text", 'por_items'::"text", 'por_comensal'::"text"]))),
    CONSTRAINT "order_splits_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."order_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "changed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "order_number" integer NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "delivery_type" "text" NOT NULL,
    "delivery_address" "text",
    "delivery_lat" numeric(10,7),
    "delivery_lng" numeric(10,7),
    "delivery_notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "subtotal_cents" bigint NOT NULL,
    "delivery_fee_cents" bigint DEFAULT 0 NOT NULL,
    "discount_cents" bigint DEFAULT 0 NOT NULL,
    "total_cents" bigint NOT NULL,
    "payment_method" "text" DEFAULT 'cash_on_delivery'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "cancelled_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mp_preference_id" "text",
    "mp_payment_id" "text",
    "promo_code_id" "uuid",
    "promo_code_snapshot" "text",
    "table_id" "uuid",
    "lifecycle_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "mozo_id" "uuid",
    "cancelled_at" timestamp with time zone,
    "tip_cents" bigint DEFAULT 0 NOT NULL,
    "discount_reason" "text",
    "closed_at" timestamp with time zone,
    "total_paid_cents" bigint DEFAULT 0 NOT NULL,
    "bill_requested_at" timestamp with time zone,
    CONSTRAINT "orders_delivery_type_check" CHECK (("delivery_type" = ANY (ARRAY['delivery'::"text", 'pickup'::"text", 'dine_in'::"text"]))),
    CONSTRAINT "orders_lifecycle_status_check" CHECK (("lifecycle_status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'on_the_way'::"text", 'delivered'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "orders_tip_cents_check" CHECK (("tip_cents" >= 0)),
    CONSTRAINT "orders_total_paid_cents_check" CHECK (("total_paid_cents" >= 0))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."cancelled_at" IS 'Timestamp de anulación de la orden (anularMesa). Pareja con cancelled_reason.';



CREATE TABLE IF NOT EXISTS "public"."payment_method_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "method" "text" NOT NULL,
    "adjustment_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "label" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_method_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "split_id" "uuid",
    "operated_by" "uuid",
    "attributed_mozo_id" "uuid",
    "method" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "tip_cents" bigint DEFAULT 0 NOT NULL,
    "last_four" "text",
    "card_brand" "text",
    "mp_payment_id" "text",
    "mp_preference_id" "text",
    "payment_status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "notes" "text",
    "refunded_at" timestamp with time zone,
    "refunded_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "caja_id" "uuid" NOT NULL,
    "adjustment_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "adjustment_cents" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "payments_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "payments_card_brand_check" CHECK ((("card_brand" IS NULL) OR ("card_brand" = ANY (ARRAY['visa'::"text", 'mastercard'::"text", 'amex'::"text", 'otro'::"text"])))),
    CONSTRAINT "payments_last_four_check" CHECK ((("last_four" IS NULL) OR ("length"("last_four") = 4))),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['cash'::"text", 'card_manual'::"text", 'mp_link'::"text", 'mp_qr'::"text", 'transfer'::"text", 'other'::"text"]))),
    CONSTRAINT "payments_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text"]))),
    CONSTRAINT "payments_tip_cents_check" CHECK (("tip_cents" >= 0))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payments"."method" IS 'Payment method: cash, card_manual, mp_link, mp_qr, transfer, other.';



CREATE TABLE IF NOT EXISTS "public"."phone_verification_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "phone" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."phone_verification_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "price_cents" bigint NOT NULL,
    "image_url" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "station_id" "uuid",
    "prep_time_minutes" smallint,
    "track_stock" boolean DEFAULT false NOT NULL,
    "is_bar_stock" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."prep_time_minutes" IS 'Estimated preparation time in minutes. NULL = not set. Used by KDS for ETA calculation.';



CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" NOT NULL,
    "discount_value" bigint DEFAULT 0 NOT NULL,
    "min_order_cents" bigint DEFAULT 0 NOT NULL,
    "max_uses" integer,
    "uses_count" integer DEFAULT 0 NOT NULL,
    "valid_from" timestamp with time zone,
    "valid_until" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid",
    CONSTRAINT "promo_codes_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed_amount'::"text", 'free_shipping'::"text"]))),
    CONSTRAINT "promo_codes_discount_value_check" CHECK (("discount_value" >= 0)),
    CONSTRAINT "promo_codes_max_uses_check" CHECK ((("max_uses" IS NULL) OR ("max_uses" > 0))),
    CONSTRAINT "promo_codes_min_order_cents_check" CHECK (("min_order_cents" >= 0)),
    CONSTRAINT "promo_codes_uses_count_check" CHECK (("uses_count" >= 0))
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric(12,4) NOT NULL,
    "notes" "text",
    CONSTRAINT "recipes_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_settings" (
    "business_id" "uuid" NOT NULL,
    "slot_duration_min" integer DEFAULT 90 NOT NULL,
    "buffer_min" integer DEFAULT 15 NOT NULL,
    "lead_time_min" integer DEFAULT 60 NOT NULL,
    "advance_days_max" integer DEFAULT 30 NOT NULL,
    "max_party_size" integer DEFAULT 12 NOT NULL,
    "schedule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "no_show_grace_min" integer DEFAULT 30 NOT NULL,
    CONSTRAINT "reservation_settings_advance_days_max_check" CHECK (("advance_days_max" > 0)),
    CONSTRAINT "reservation_settings_buffer_min_check" CHECK (("buffer_min" >= 0)),
    CONSTRAINT "reservation_settings_lead_time_min_check" CHECK (("lead_time_min" >= 0)),
    CONSTRAINT "reservation_settings_max_party_size_check" CHECK (("max_party_size" > 0)),
    CONSTRAINT "reservation_settings_no_show_grace_min_check" CHECK (("no_show_grace_min" >= 0)),
    CONSTRAINT "reservation_settings_slot_duration_min_check" CHECK (("slot_duration_min" > 0))
);


ALTER TABLE "public"."reservation_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "table_id" "uuid",
    "user_id" "uuid",
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "party_size" integer NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "notes" "text",
    "source" "text" DEFAULT 'web'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_confirmed_at" timestamp with time zone,
    CONSTRAINT "reservations_party_size_check" CHECK (("party_size" > 0)),
    CONSTRAINT "reservations_source_check" CHECK (("source" = ANY (ARRAY['web'::"text", 'admin'::"text", 'chatbot'::"text"]))),
    CONSTRAINT "reservations_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'seated'::"text", 'completed'::"text", 'no_show'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "reservations_time_valid" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "printer_ip" "text",
    "printer_port" integer DEFAULT 9100 NOT NULL,
    "printer_enabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."stations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "current_qty" integer DEFAULT 0 NOT NULL,
    "min_qty" integer DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT 'unidad'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stock_item_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "qty" integer NOT NULL,
    "order_item_id" "uuid",
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_movimientos_kind_check" CHECK (("kind" = ANY (ARRAY['ingreso'::"text", 'venta'::"text", 'ajuste'::"text"])))
);


ALTER TABLE "public"."stock_movimientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."super_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "icon" "text" DEFAULT 'utensils-crossed'::"text" NOT NULL,
    "color" "text" DEFAULT 'zinc'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."super_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."super_categories" IS 'Agrupador de categorías por momento de servicio (entradas/principales/bebidas/postres). Per business — el admin puede renombrar, reordenar o sumar nuevos.';



CREATE TABLE IF NOT EXISTS "public"."supplier_ingredients" (
    "supplier_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "invoice_number" "text",
    "invoice_date" "date" NOT NULL,
    "total_cents" integer NOT NULL,
    "photo_url" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supplier_invoices_total_cents_check" CHECK (("total_cents" >= 0))
);


ALTER TABLE "public"."supplier_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cuit" "text",
    "contact" "text",
    "phone" "text",
    "email" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "floor_plan_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "seats" integer NOT NULL,
    "shape" "text" NOT NULL,
    "x" integer NOT NULL,
    "y" integer NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "rotation" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operational_status" "text" DEFAULT 'libre'::"text" NOT NULL,
    "current_order_id" "uuid",
    "opened_at" timestamp with time zone,
    "mozo_id" "uuid",
    "is_bar" boolean DEFAULT false NOT NULL,
    CONSTRAINT "tables_height_check" CHECK (("height" > 0)),
    CONSTRAINT "tables_operational_status_check" CHECK (("operational_status" = ANY (ARRAY['libre'::"text", 'ocupada'::"text", 'pidio_cuenta'::"text"]))),
    CONSTRAINT "tables_seats_check" CHECK (("seats" > 0)),
    CONSTRAINT "tables_shape_check" CHECK (("shape" = ANY (ARRAY['circle'::"text", 'square'::"text", 'rect'::"text"]))),
    CONSTRAINT "tables_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"]))),
    CONSTRAINT "tables_width_check" CHECK (("width" > 0))
);


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "from_value" "text",
    "to_value" "text",
    "by_user_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tables_audit_log_kind_check" CHECK (("kind" = ANY (ARRAY['assignment'::"text", 'status'::"text", 'transfer'::"text"])))
);


ALTER TABLE "public"."tables_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_platform_admin" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_credentials" (
    "business_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT '360dialog'::"text" NOT NULL,
    "api_key" "text",
    "from_phone" "text",
    "channel_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "to_phone" "text",
    "body" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "ref_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "provider_message_id" "text",
    CONSTRAINT "whatsapp_outbox_kind_check" CHECK (("kind" = ANY (ARRAY['notification'::"text", 'delivery_status'::"text"]))),
    CONSTRAINT "whatsapp_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."whatsapp_outbox" OWNER TO "postgres";


ALTER TABLE ONLY "public"."business_hours"
    ADD CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_pkey" PRIMARY KEY ("business_id", "user_id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."caja_cortes"
    ADD CONSTRAINT "caja_cortes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caja_movimientos"
    ADD CONSTRAINT "caja_movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caja_user_assignments"
    ADD CONSTRAINT "caja_user_assignments_business_id_caja_id_user_id_key" UNIQUE ("business_id", "caja_id", "user_id");



ALTER TABLE ONLY "public"."caja_user_assignments"
    ADD CONSTRAINT "caja_user_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cajas"
    ADD CONSTRAINT "cajas_business_id_name_key" UNIQUE ("business_id", "name");



ALTER TABLE ONLY "public"."cajas"
    ADD CONSTRAINT "cajas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_business_id_slug_key" UNIQUE ("business_id", "slug");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_configs"
    ADD CONSTRAINT "chatbot_configs_pkey" PRIMARY KEY ("business_id");



ALTER TABLE ONLY "public"."chatbot_contacts"
    ADD CONSTRAINT "chatbot_contacts_business_id_channel_identifier_key" UNIQUE ("business_id", "channel", "identifier");



ALTER TABLE ONLY "public"."chatbot_contacts"
    ADD CONSTRAINT "chatbot_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_conversations"
    ADD CONSTRAINT "chatbot_conversations_cart_token_key" UNIQUE ("cart_token");



ALTER TABLE ONLY "public"."chatbot_conversations"
    ADD CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_messages"
    ADD CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clock_allowed_origins"
    ADD CONSTRAINT "clock_allowed_origins_business_id_cidr_key" UNIQUE ("business_id", "cidr");



ALTER TABLE ONLY "public"."clock_allowed_origins"
    ADD CONSTRAINT "clock_allowed_origins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clock_blocked_attempts"
    ADD CONSTRAINT "clock_blocked_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clock_entries"
    ADD CONSTRAINT "clock_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comanda_items"
    ADD CONSTRAINT "comanda_items_pkey" PRIMARY KEY ("comanda_id", "order_item_id");



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_order_id_station_id_batch_key" UNIQUE ("order_id", "station_id", "batch");



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_business_id_phone_key" UNIQUE ("business_id", "phone");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_menu_components"
    ADD CONSTRAINT "daily_menu_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_menus"
    ADD CONSTRAINT "daily_menus_business_id_slug_key" UNIQUE ("business_id", "slug");



ALTER TABLE ONLY "public"."daily_menus"
    ADD CONSTRAINT "daily_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_message_templates"
    ADD CONSTRAINT "delivery_message_templates_business_id_status_key" UNIQUE ("business_id", "status");



ALTER TABLE ONLY "public"."delivery_message_templates"
    ADD CONSTRAINT "delivery_message_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."floor_plans"
    ADD CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_consumptions"
    ADD CONSTRAINT "ingredient_consumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_presentations"
    ADD CONSTRAINT "ingredient_presentations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_price_log"
    ADD CONSTRAINT "ingredient_price_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_recipes"
    ADD CONSTRAINT "ingredient_recipes_parent_ingredient_id_child_ingredient_id_key" UNIQUE ("parent_ingredient_id", "child_ingredient_id");



ALTER TABLE ONLY "public"."ingredient_recipes"
    ADD CONSTRAINT "ingredient_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_business_id_name_key" UNIQUE ("business_id", "name");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_business_id_tipo_comprobante_punto_venta_numero_key" UNIQUE ("business_id", "tipo_comprobante", "punto_venta", "numero");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mozo_rendiciones"
    ADD CONSTRAINT "mozo_rendiciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_item_modifiers"
    ADD CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_split_items"
    ADD CONSTRAINT "order_split_items_pkey" PRIMARY KEY ("split_id", "order_item_id");



ALTER TABLE ONLY "public"."order_splits"
    ADD CONSTRAINT "order_splits_order_id_split_index_key" UNIQUE ("order_id", "split_index");



ALTER TABLE ONLY "public"."order_splits"
    ADD CONSTRAINT "order_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_business_id_order_number_key" UNIQUE ("business_id", "order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_method_configs"
    ADD CONSTRAINT "payment_method_configs_business_id_method_key" UNIQUE ("business_id", "method");



ALTER TABLE ONLY "public"."payment_method_configs"
    ADD CONSTRAINT "payment_method_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."phone_verification_codes"
    ADD CONSTRAINT "phone_verification_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_business_id_slug_key" UNIQUE ("business_id", "slug");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_product_id_ingredient_id_key" UNIQUE ("product_id", "ingredient_id");



ALTER TABLE ONLY "public"."reservation_settings"
    ADD CONSTRAINT "reservation_settings_pkey" PRIMARY KEY ("business_id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_no_overlap" EXCLUDE USING "gist" ("table_id" WITH =, "tstzrange"("starts_at", "ends_at") WITH &&) WHERE ((("status" = ANY (ARRAY['confirmed'::"text", 'seated'::"text"])) AND ("table_id" IS NOT NULL)));



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_business_id_name_key" UNIQUE ("business_id", "name");



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_business_id_product_id_key" UNIQUE ("business_id", "product_id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_categories"
    ADD CONSTRAINT "super_categories_business_id_slug_key" UNIQUE ("business_id", "slug");



ALTER TABLE ONLY "public"."super_categories"
    ADD CONSTRAINT "super_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_ingredients"
    ADD CONSTRAINT "supplier_ingredients_pkey" PRIMARY KEY ("supplier_id", "ingredient_id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_business_id_name_key" UNIQUE ("business_id", "name");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables_audit_log"
    ADD CONSTRAINT "tables_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_credentials"
    ADD CONSTRAINT "whatsapp_credentials_pkey" PRIMARY KEY ("business_id");



ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_pkey" PRIMARY KEY ("id");



CREATE INDEX "business_hours_business_id_day_of_week_idx" ON "public"."business_hours" USING "btree" ("business_id", "day_of_week");



CREATE INDEX "business_users_active_idx" ON "public"."business_users" USING "btree" ("business_id") WHERE ("disabled_at" IS NULL);



CREATE UNIQUE INDEX "business_users_pin_unique_idx" ON "public"."business_users" USING "btree" ("business_id", "pin") WHERE (("pin" IS NOT NULL) AND ("disabled_at" IS NULL));



CREATE INDEX "business_users_user_id_idx" ON "public"."business_users" USING "btree" ("user_id");



CREATE INDEX "caja_cortes_business_idx" ON "public"."caja_cortes" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "caja_cortes_caja_idx" ON "public"."caja_cortes" USING "btree" ("caja_id", "created_at" DESC);



CREATE INDEX "caja_mov_business_idx" ON "public"."caja_movimientos" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "caja_mov_caja_idx" ON "public"."caja_movimientos" USING "btree" ("caja_id", "created_at" DESC);



CREATE INDEX "cajas_business_active_idx" ON "public"."cajas" USING "btree" ("business_id") WHERE "is_active";



CREATE INDEX "campaign_messages_campaign_idx" ON "public"."campaign_messages" USING "btree" ("campaign_id", "status");



CREATE INDEX "campaign_messages_promo_idx" ON "public"."campaign_messages" USING "btree" ("promo_code_id") WHERE ("promo_code_id" IS NOT NULL);



CREATE INDEX "campaigns_business_status_idx" ON "public"."campaigns" USING "btree" ("business_id", "status", "created_at" DESC);



CREATE INDEX "categories_station_idx" ON "public"."categories" USING "btree" ("station_id") WHERE ("station_id" IS NOT NULL);



CREATE INDEX "categories_super_category_idx" ON "public"."categories" USING "btree" ("super_category_id");



CREATE INDEX "chatbot_conversations_cart_token_idx" ON "public"."chatbot_conversations" USING "btree" ("cart_token") WHERE ("cart_token" IS NOT NULL);



CREATE UNIQUE INDEX "chatbot_conversations_one_open_per_contact" ON "public"."chatbot_conversations" USING "btree" ("contact_id") WHERE ("closed_at" IS NULL);



CREATE UNIQUE INDEX "chatbot_conversations_reservation_token_idx" ON "public"."chatbot_conversations" USING "btree" ("reservation_token") WHERE ("reservation_token" IS NOT NULL);



CREATE INDEX "chatbot_messages_conversation_idx" ON "public"."chatbot_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "clock_allowed_origins_business_idx" ON "public"."clock_allowed_origins" USING "btree" ("business_id");



CREATE INDEX "clock_blocked_attempts_business_date_idx" ON "public"."clock_blocked_attempts" USING "btree" ("business_id", "attempted_at" DESC);



CREATE INDEX "clock_entries_business_date_idx" ON "public"."clock_entries" USING "btree" ("business_id", "clock_in" DESC);



CREATE INDEX "clock_entries_user_idx" ON "public"."clock_entries" USING "btree" ("user_id", "clock_in" DESC);



CREATE INDEX "comanda_items_order_item_idx" ON "public"."comanda_items" USING "btree" ("order_item_id");



CREATE INDEX "comandas_order_idx" ON "public"."comandas" USING "btree" ("order_id");



CREATE INDEX "comandas_station_status_idx" ON "public"."comandas" USING "btree" ("station_id", "status", "emitted_at");



CREATE INDEX "customer_addresses_customer_id_idx" ON "public"."customer_addresses" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "customers_business_user_unique" ON "public"."customers" USING "btree" ("business_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "customers_user_id_idx" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "daily_menu_components_menu_id_idx" ON "public"."daily_menu_components" USING "btree" ("menu_id");



CREATE INDEX "daily_menu_components_product_id" ON "public"."daily_menu_components" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "daily_menus_available_days_idx" ON "public"."daily_menus" USING "gin" ("available_days");



CREATE INDEX "daily_menus_business_id_is_active_idx" ON "public"."daily_menus" USING "btree" ("business_id", "is_active");



CREATE INDEX "delivery_templates_business_idx" ON "public"."delivery_message_templates" USING "btree" ("business_id");



CREATE INDEX "floor_plans_business_idx" ON "public"."floor_plans" USING "btree" ("business_id");



CREATE INDEX "idx_caja_cortes_encargado_id" ON "public"."caja_cortes" USING "btree" ("encargado_id");



CREATE INDEX "idx_caja_movimientos_created_by" ON "public"."caja_movimientos" USING "btree" ("created_by");



CREATE INDEX "idx_caja_user_assignments_caja_id" ON "public"."caja_user_assignments" USING "btree" ("caja_id");



CREATE INDEX "idx_caja_user_assignments_lookup" ON "public"."caja_user_assignments" USING "btree" ("business_id", "caja_id");



CREATE INDEX "idx_caja_user_assignments_user_id" ON "public"."caja_user_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_campaign_messages_customer_id" ON "public"."campaign_messages" USING "btree" ("customer_id");



CREATE INDEX "idx_campaign_messages_redeemed_order_id" ON "public"."campaign_messages" USING "btree" ("redeemed_order_id");



CREATE INDEX "idx_chatbot_conversations_business_id" ON "public"."chatbot_conversations" USING "btree" ("business_id");



CREATE INDEX "idx_clock_allowed_origins_created_by" ON "public"."clock_allowed_origins" USING "btree" ("created_by");



CREATE INDEX "idx_ingredient_price_log_presentation_id" ON "public"."ingredient_price_log" USING "btree" ("presentation_id");



CREATE INDEX "idx_ingredient_price_log_recorded_by" ON "public"."ingredient_price_log" USING "btree" ("recorded_by");



CREATE INDEX "idx_modifier_groups_business_id" ON "public"."modifier_groups" USING "btree" ("business_id");



CREATE INDEX "idx_mozo_rendiciones_lookup" ON "public"."mozo_rendiciones" USING "btree" ("business_id", "mozo_id", "created_at" DESC);



CREATE INDEX "idx_mozo_rendiciones_mozo_id" ON "public"."mozo_rendiciones" USING "btree" ("mozo_id");



CREATE INDEX "idx_mozo_rendiciones_registered_by" ON "public"."mozo_rendiciones" USING "btree" ("registered_by");



CREATE INDEX "idx_notification_preferences_target_user_id" ON "public"."notification_preferences" USING "btree" ("target_user_id");



CREATE INDEX "idx_order_item_modifiers_modifier_id" ON "public"."order_item_modifiers" USING "btree" ("modifier_id");



CREATE INDEX "idx_order_items_daily_menu_id" ON "public"."order_items" USING "btree" ("daily_menu_id");



CREATE INDEX "idx_order_items_loaded_by" ON "public"."order_items" USING "btree" ("loaded_by");



CREATE INDEX "idx_order_items_product_id" ON "public"."order_items" USING "btree" ("product_id");



CREATE INDEX "idx_order_status_history_changed_by" ON "public"."order_status_history" USING "btree" ("changed_by");



CREATE INDEX "idx_payments_operated_by" ON "public"."payments" USING "btree" ("operated_by");



CREATE INDEX "idx_products_category_id" ON "public"."products" USING "btree" ("category_id");



CREATE INDEX "idx_stock_items_product_id" ON "public"."stock_items" USING "btree" ("product_id");



CREATE INDEX "idx_stock_movimientos_created_by" ON "public"."stock_movimientos" USING "btree" ("created_by");



CREATE INDEX "idx_stock_movimientos_order_item_id" ON "public"."stock_movimientos" USING "btree" ("order_item_id");



CREATE INDEX "idx_supplier_ingredients_business_id" ON "public"."supplier_ingredients" USING "btree" ("business_id");



CREATE INDEX "idx_supplier_ingredients_ingredient_id" ON "public"."supplier_ingredients" USING "btree" ("ingredient_id");



CREATE INDEX "idx_supplier_invoices_created_by" ON "public"."supplier_invoices" USING "btree" ("created_by");



CREATE INDEX "idx_tables_audit_log_by_user_id" ON "public"."tables_audit_log" USING "btree" ("by_user_id");



CREATE INDEX "idx_tables_bar" ON "public"."tables" USING "btree" ("floor_plan_id") WHERE "is_bar";



CREATE INDEX "idx_tables_current_order_id" ON "public"."tables" USING "btree" ("current_order_id");



CREATE INDEX "ingredient_consumptions_business_idx" ON "public"."ingredient_consumptions" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "ingredient_consumptions_ingredient_idx" ON "public"."ingredient_consumptions" USING "btree" ("ingredient_id", "created_at" DESC);



CREATE INDEX "ingredient_consumptions_order_item_idx" ON "public"."ingredient_consumptions" USING "btree" ("order_item_id") WHERE ("order_item_id" IS NOT NULL);



CREATE INDEX "ingredient_presentations_ingredient_idx" ON "public"."ingredient_presentations" USING "btree" ("ingredient_id");



CREATE UNIQUE INDEX "ingredient_presentations_one_default_idx" ON "public"."ingredient_presentations" USING "btree" ("ingredient_id") WHERE ("is_default" = true);



CREATE INDEX "ingredient_price_log_ingredient_idx" ON "public"."ingredient_price_log" USING "btree" ("ingredient_id", "recorded_at" DESC);



CREATE INDEX "ingredient_recipes_child_idx" ON "public"."ingredient_recipes" USING "btree" ("child_ingredient_id");



CREATE INDEX "ingredient_recipes_parent_idx" ON "public"."ingredient_recipes" USING "btree" ("parent_ingredient_id");



CREATE INDEX "ingredients_business_idx" ON "public"."ingredients" USING "btree" ("business_id");



CREATE INDEX "invoices_business_created_idx" ON "public"."invoices" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "invoices_business_status_idx" ON "public"."invoices" USING "btree" ("business_id", "status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "invoices_cancels_idx" ON "public"."invoices" USING "btree" ("cancels_invoice_id") WHERE ("cancels_invoice_id" IS NOT NULL);



CREATE INDEX "invoices_order_idx" ON "public"."invoices" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE UNIQUE INDEX "invoices_order_tipo_active_uq" ON "public"."invoices" USING "btree" ("business_id", "order_id", "tipo_comprobante") WHERE (("status" = ANY (ARRAY['pending'::"text", 'authorized'::"text"])) AND ("order_id" IS NOT NULL));



CREATE INDEX "invoices_payment_idx" ON "public"."invoices" USING "btree" ("payment_id") WHERE ("payment_id" IS NOT NULL);



CREATE INDEX "modifier_groups_product_id_idx" ON "public"."modifier_groups" USING "btree" ("product_id");



CREATE INDEX "modifiers_group_id_idx" ON "public"."modifiers" USING "btree" ("group_id");



CREATE INDEX "notification_prefs_lookup_idx" ON "public"."notification_preferences" USING "btree" ("business_id", "event_type");



CREATE UNIQUE INDEX "notification_prefs_role_uniq" ON "public"."notification_preferences" USING "btree" ("business_id", "event_type", "target_role", "channel") WHERE ("target_role" IS NOT NULL);



CREATE UNIQUE INDEX "notification_prefs_user_uniq" ON "public"."notification_preferences" USING "btree" ("business_id", "event_type", "target_user_id", "channel") WHERE ("target_user_id" IS NOT NULL);



CREATE INDEX "notifications_role_idx" ON "public"."notifications" USING "btree" ("business_id", "target_role", "read_at") WHERE ("target_role" IS NOT NULL);



CREATE INDEX "notifications_user_idx" ON "public"."notifications" USING "btree" ("user_id", "read_at", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "order_item_modifiers_order_item_id_idx" ON "public"."order_item_modifiers" USING "btree" ("order_item_id");



CREATE INDEX "order_items_kitchen_status_idx" ON "public"."order_items" USING "btree" ("kitchen_status");



CREATE INDEX "order_items_order_id_idx" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "order_items_parent" ON "public"."order_items" USING "btree" ("parent_order_item_id") WHERE ("parent_order_item_id" IS NOT NULL);



CREATE INDEX "order_items_station_idx" ON "public"."order_items" USING "btree" ("station_id") WHERE ("station_id" IS NOT NULL);



CREATE INDEX "order_split_items_item_idx" ON "public"."order_split_items" USING "btree" ("order_item_id");



CREATE INDEX "order_splits_business_idx" ON "public"."order_splits" USING "btree" ("business_id");



CREATE INDEX "order_splits_order_idx" ON "public"."order_splits" USING "btree" ("order_id");



CREATE INDEX "order_status_history_order_id_created_at_idx" ON "public"."order_status_history" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "orders_bill_requested_idx" ON "public"."orders" USING "btree" ("business_id", "bill_requested_at" DESC) WHERE ("bill_requested_at" IS NOT NULL);



CREATE INDEX "orders_business_id_created_at_idx" ON "public"."orders" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "orders_business_id_status_created_at_idx" ON "public"."orders" USING "btree" ("business_id", "status", "created_at" DESC);



CREATE INDEX "orders_closed_at_idx" ON "public"."orders" USING "btree" ("business_id", "closed_at" DESC) WHERE ("closed_at" IS NOT NULL);



CREATE INDEX "orders_customer_id_idx" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "orders_lifecycle_idx" ON "public"."orders" USING "btree" ("business_id", "lifecycle_status") WHERE ("lifecycle_status" = 'open'::"text");



CREATE INDEX "orders_mozo_idx" ON "public"."orders" USING "btree" ("mozo_id") WHERE ("mozo_id" IS NOT NULL);



CREATE INDEX "orders_mp_payment_id_idx" ON "public"."orders" USING "btree" ("mp_payment_id") WHERE ("mp_payment_id" IS NOT NULL);



CREATE INDEX "orders_mp_preference_id_idx" ON "public"."orders" USING "btree" ("mp_preference_id") WHERE ("mp_preference_id" IS NOT NULL);



CREATE UNIQUE INDEX "orders_one_open_per_table" ON "public"."orders" USING "btree" ("table_id") WHERE (("lifecycle_status" = 'open'::"text") AND ("table_id" IS NOT NULL));



CREATE INDEX "orders_promo_code_id_idx" ON "public"."orders" USING "btree" ("promo_code_id") WHERE ("promo_code_id" IS NOT NULL);



CREATE INDEX "orders_table_id_idx" ON "public"."orders" USING "btree" ("table_id");



CREATE INDEX "payments_attributed_mozo_idx" ON "public"."payments" USING "btree" ("attributed_mozo_id", "created_at" DESC) WHERE ("attributed_mozo_id" IS NOT NULL);



CREATE INDEX "payments_business_method_idx" ON "public"."payments" USING "btree" ("business_id", "method", "created_at" DESC);



CREATE INDEX "payments_caja_idx" ON "public"."payments" USING "btree" ("caja_id", "created_at" DESC);



CREATE INDEX "payments_mp_idx" ON "public"."payments" USING "btree" ("mp_payment_id") WHERE ("mp_payment_id" IS NOT NULL);



CREATE INDEX "payments_order_idx" ON "public"."payments" USING "btree" ("order_id");



CREATE INDEX "payments_split_idx" ON "public"."payments" USING "btree" ("split_id") WHERE ("split_id" IS NOT NULL);



CREATE INDEX "phone_verification_codes_user_active_idx" ON "public"."phone_verification_codes" USING "btree" ("user_id", "consumed_at");



CREATE INDEX "products_bar_stock_idx" ON "public"."products" USING "btree" ("business_id") WHERE ("is_bar_stock" = true);



CREATE INDEX "products_business_id_category_id_idx" ON "public"."products" USING "btree" ("business_id", "category_id");



CREATE INDEX "products_business_id_idx" ON "public"."products" USING "btree" ("business_id") WHERE ("is_active" = true);



CREATE INDEX "products_station_idx" ON "public"."products" USING "btree" ("station_id") WHERE ("station_id" IS NOT NULL);



CREATE INDEX "promo_codes_business_active_idx" ON "public"."promo_codes" USING "btree" ("business_id", "is_active");



CREATE UNIQUE INDEX "promo_codes_business_code_lower_idx" ON "public"."promo_codes" USING "btree" ("business_id", "lower"("code"));



CREATE INDEX "promo_codes_customer_id_idx" ON "public"."promo_codes" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "recipes_ingredient_idx" ON "public"."recipes" USING "btree" ("ingredient_id");



CREATE INDEX "recipes_product_idx" ON "public"."recipes" USING "btree" ("product_id");



CREATE INDEX "reservations_business_starts_idx" ON "public"."reservations" USING "btree" ("business_id", "starts_at");



CREATE INDEX "reservations_table_starts_idx" ON "public"."reservations" USING "btree" ("table_id", "starts_at") WHERE ("table_id" IS NOT NULL);



CREATE INDEX "reservations_user_idx" ON "public"."reservations" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "stations_business_idx" ON "public"."stations" USING "btree" ("business_id");



CREATE INDEX "stock_items_business_idx" ON "public"."stock_items" USING "btree" ("business_id");



CREATE INDEX "stock_movimientos_business_idx" ON "public"."stock_movimientos" USING "btree" ("business_id");



CREATE INDEX "stock_movimientos_item_idx" ON "public"."stock_movimientos" USING "btree" ("stock_item_id", "created_at" DESC);



CREATE INDEX "super_categories_business_idx" ON "public"."super_categories" USING "btree" ("business_id");



CREATE INDEX "supplier_invoices_biz_date_idx" ON "public"."supplier_invoices" USING "btree" ("business_id", "invoice_date");



CREATE INDEX "supplier_invoices_supplier_idx" ON "public"."supplier_invoices" USING "btree" ("supplier_id");



CREATE INDEX "suppliers_business_idx" ON "public"."suppliers" USING "btree" ("business_id");



CREATE INDEX "tables_audit_business_idx" ON "public"."tables_audit_log" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "tables_audit_table_idx" ON "public"."tables_audit_log" USING "btree" ("table_id", "created_at" DESC);



CREATE INDEX "tables_floor_plan_idx" ON "public"."tables" USING "btree" ("floor_plan_id");



CREATE INDEX "tables_mozo_idx" ON "public"."tables" USING "btree" ("mozo_id") WHERE ("mozo_id" IS NOT NULL);



CREATE INDEX "whatsapp_outbox_kind_idx" ON "public"."whatsapp_outbox" USING "btree" ("business_id", "kind", "created_at" DESC);



CREATE INDEX "whatsapp_outbox_status_idx" ON "public"."whatsapp_outbox" USING "btree" ("business_id", "status");



CREATE OR REPLACE TRIGGER "campaigns_set_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "daily_menus_set_updated_at" BEFORE UPDATE ON "public"."daily_menus" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "delivery_message_templates_set_updated_at" BEFORE UPDATE ON "public"."delivery_message_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "floor_plans_set_updated_at" BEFORE UPDATE ON "public"."floor_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ingredients_set_updated_at" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "notification_preferences_set_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "orders_log_initial_status" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_order_initial_status"();



CREATE OR REPLACE TRIGGER "orders_log_status_change" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_order_status_change"();



CREATE OR REPLACE TRIGGER "orders_mark_campaign_redeemed" AFTER INSERT ON "public"."orders" FOR EACH ROW WHEN (("new"."promo_code_id" IS NOT NULL)) EXECUTE FUNCTION "public"."mark_campaign_message_redeemed"();



CREATE OR REPLACE TRIGGER "orders_set_order_number" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_order_number"();



CREATE OR REPLACE TRIGGER "orders_set_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "promo_codes_set_updated_at" BEFORE UPDATE ON "public"."promo_codes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "reservation_settings_set_updated_at" BEFORE UPDATE ON "public"."reservation_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "reservations_set_updated_at" BEFORE UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "super_categories_seed_on_business" AFTER INSERT ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_default_super_categories"();



CREATE OR REPLACE TRIGGER "suppliers_set_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ingredient_price_change" AFTER UPDATE ON "public"."ingredient_presentations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_ingredient_price_change_log"();



CREATE OR REPLACE TRIGGER "trg_recipe_stock_descuento" AFTER INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_recipe_stock_descuento"();



CREATE OR REPLACE TRIGGER "trg_recipe_stock_reversion" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_recipe_stock_reversion"();



CREATE OR REPLACE TRIGGER "trg_stock_descuento" AFTER INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_stock_descuento_on_order_item"();



CREATE OR REPLACE TRIGGER "whatsapp_credentials_set_updated_at" BEFORE UPDATE ON "public"."whatsapp_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."business_hours"
    ADD CONSTRAINT "business_hours_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caja_cortes"
    ADD CONSTRAINT "caja_cortes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caja_cortes"
    ADD CONSTRAINT "caja_cortes_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."caja_cortes"
    ADD CONSTRAINT "caja_cortes_encargado_id_fkey" FOREIGN KEY ("encargado_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."caja_movimientos"
    ADD CONSTRAINT "caja_movimientos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caja_movimientos"
    ADD CONSTRAINT "caja_movimientos_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."caja_movimientos"
    ADD CONSTRAINT "caja_movimientos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caja_user_assignments"
    ADD CONSTRAINT "caja_user_assignments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caja_user_assignments"
    ADD CONSTRAINT "caja_user_assignments_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caja_user_assignments"
    ADD CONSTRAINT "caja_user_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cajas"
    ADD CONSTRAINT "cajas_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_redeemed_order_id_fkey" FOREIGN KEY ("redeemed_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_super_category_id_fkey" FOREIGN KEY ("super_category_id") REFERENCES "public"."super_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chatbot_configs"
    ADD CONSTRAINT "chatbot_configs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chatbot_contacts"
    ADD CONSTRAINT "chatbot_contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chatbot_conversations"
    ADD CONSTRAINT "chatbot_conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chatbot_conversations"
    ADD CONSTRAINT "chatbot_conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."chatbot_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chatbot_messages"
    ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chatbot_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clock_allowed_origins"
    ADD CONSTRAINT "clock_allowed_origins_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clock_allowed_origins"
    ADD CONSTRAINT "clock_allowed_origins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clock_blocked_attempts"
    ADD CONSTRAINT "clock_blocked_attempts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clock_entries"
    ADD CONSTRAINT "clock_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id");



ALTER TABLE ONLY "public"."clock_entries"
    ADD CONSTRAINT "clock_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."comanda_items"
    ADD CONSTRAINT "comanda_items_comanda_id_fkey" FOREIGN KEY ("comanda_id") REFERENCES "public"."comandas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comanda_items"
    ADD CONSTRAINT "comanda_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_menu_components"
    ADD CONSTRAINT "daily_menu_components_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."daily_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_menu_components"
    ADD CONSTRAINT "daily_menu_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."daily_menus"
    ADD CONSTRAINT "daily_menus_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_message_templates"
    ADD CONSTRAINT "delivery_message_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."floor_plans"
    ADD CONSTRAINT "floor_plans_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_consumptions"
    ADD CONSTRAINT "ingredient_consumptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_consumptions"
    ADD CONSTRAINT "ingredient_consumptions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_consumptions"
    ADD CONSTRAINT "ingredient_consumptions_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ingredient_presentations"
    ADD CONSTRAINT "ingredient_presentations_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_price_log"
    ADD CONSTRAINT "ingredient_price_log_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_price_log"
    ADD CONSTRAINT "ingredient_price_log_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "public"."ingredient_presentations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ingredient_price_log"
    ADD CONSTRAINT "ingredient_price_log_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ingredient_recipes"
    ADD CONSTRAINT "ingredient_recipes_child_ingredient_id_fkey" FOREIGN KEY ("child_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ingredient_recipes"
    ADD CONSTRAINT "ingredient_recipes_parent_ingredient_id_fkey" FOREIGN KEY ("parent_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_cancels_invoice_id_fkey" FOREIGN KEY ("cancels_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mozo_rendiciones"
    ADD CONSTRAINT "mozo_rendiciones_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mozo_rendiciones"
    ADD CONSTRAINT "mozo_rendiciones_mozo_id_fkey" FOREIGN KEY ("mozo_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mozo_rendiciones"
    ADD CONSTRAINT "mozo_rendiciones_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_item_modifiers"
    ADD CONSTRAINT "order_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_item_modifiers"
    ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_daily_menu_id_fkey" FOREIGN KEY ("daily_menu_id") REFERENCES "public"."daily_menus"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_loaded_by_fkey" FOREIGN KEY ("loaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_parent_order_item_id_fkey" FOREIGN KEY ("parent_order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_split_items"
    ADD CONSTRAINT "order_split_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_split_items"
    ADD CONSTRAINT "order_split_items_split_id_fkey" FOREIGN KEY ("split_id") REFERENCES "public"."order_splits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_splits"
    ADD CONSTRAINT "order_splits_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_splits"
    ADD CONSTRAINT "order_splits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_mozo_id_fkey" FOREIGN KEY ("mozo_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_method_configs"
    ADD CONSTRAINT "payment_method_configs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_attributed_mozo_id_fkey" FOREIGN KEY ("attributed_mozo_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_operated_by_fkey" FOREIGN KEY ("operated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_split_id_fkey" FOREIGN KEY ("split_id") REFERENCES "public"."order_splits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."phone_verification_codes"
    ADD CONSTRAINT "phone_verification_codes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."phone_verification_codes"
    ADD CONSTRAINT "phone_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservation_settings"
    ADD CONSTRAINT "reservation_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."super_categories"
    ADD CONSTRAINT "super_categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_ingredients"
    ADD CONSTRAINT "supplier_ingredients_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_ingredients"
    ADD CONSTRAINT "supplier_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_ingredients"
    ADD CONSTRAINT "supplier_ingredients_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables_audit_log"
    ADD CONSTRAINT "tables_audit_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables_audit_log"
    ADD CONSTRAINT "tables_audit_log_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tables_audit_log"
    ADD CONSTRAINT "tables_audit_log_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_current_order_id_fkey" FOREIGN KEY ("current_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_floor_plan_id_fkey" FOREIGN KEY ("floor_plan_id") REFERENCES "public"."floor_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_mozo_id_fkey" FOREIGN KEY ("mozo_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_credentials"
    ADD CONSTRAINT "whatsapp_credentials_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



CREATE POLICY "admin_delete_campaigns" ON "public"."campaigns" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_delete_daily_menu_components" ON "public"."daily_menu_components" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."daily_menus" "m"
  WHERE (("m"."id" = "daily_menu_components"."menu_id") AND "public"."is_business_member"("m"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_delete_daily_menus" ON "public"."daily_menus" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_delete_floor_plans" ON "public"."floor_plans" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_delete_promo_codes" ON "public"."promo_codes" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_delete_reservation_settings" ON "public"."reservation_settings" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_delete_reservations" ON "public"."reservations" FOR DELETE TO "authenticated" USING ("public"."is_business_staff"("business_id"));



CREATE POLICY "admin_delete_tables" ON "public"."tables" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."floor_plans" "fp"
  WHERE (("fp"."id" = "tables"."floor_plan_id") AND "public"."is_business_member"("fp"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_insert_campaigns" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_insert_daily_menu_components" ON "public"."daily_menu_components" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."daily_menus" "m"
  WHERE (("m"."id" = "daily_menu_components"."menu_id") AND "public"."is_business_member"("m"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_insert_daily_menus" ON "public"."daily_menus" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_insert_floor_plans" ON "public"."floor_plans" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_insert_promo_codes" ON "public"."promo_codes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_insert_reservation_settings" ON "public"."reservation_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_insert_reservations" ON "public"."reservations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_business_staff"("business_id"));



CREATE POLICY "admin_insert_tables" ON "public"."tables" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."floor_plans" "fp"
  WHERE (("fp"."id" = "tables"."floor_plan_id") AND "public"."is_business_member"("fp"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_select_campaign_messages" ON "public"."campaign_messages" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_messages"."campaign_id") AND "public"."is_business_member"("c"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_select_campaigns" ON "public"."campaigns" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_select_daily_menu_components" ON "public"."daily_menu_components" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."daily_menus" "m"
  WHERE (("m"."id" = "daily_menu_components"."menu_id") AND "public"."is_business_member"("m"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_select_daily_menus" ON "public"."daily_menus" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_select_promo_codes" ON "public"."promo_codes" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_campaign_messages" ON "public"."campaign_messages" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_messages"."campaign_id") AND "public"."is_business_member"("c"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_campaigns" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_daily_menu_components" ON "public"."daily_menu_components" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."daily_menus" "m"
  WHERE (("m"."id" = "daily_menu_components"."menu_id") AND "public"."is_business_member"("m"."business_id")))) OR "public"."is_platform_admin"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."daily_menus" "m"
  WHERE (("m"."id" = "daily_menu_components"."menu_id") AND "public"."is_business_member"("m"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_daily_menus" ON "public"."daily_menus" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_floor_plans" ON "public"."floor_plans" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_promo_codes" ON "public"."promo_codes" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_reservation_settings" ON "public"."reservation_settings" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "admin_update_tables" ON "public"."tables" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."floor_plans" "fp"
  WHERE (("fp"."id" = "tables"."floor_plan_id") AND "public"."is_business_member"("fp"."business_id")))) OR "public"."is_platform_admin"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."floor_plans" "fp"
  WHERE (("fp"."id" = "tables"."floor_plan_id") AND "public"."is_business_member"("fp"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."business_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_hours_delete" ON "public"."business_hours" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "business_hours_insert" ON "public"."business_hours" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "business_hours_select" ON "public"."business_hours" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "business_hours_update" ON "public"."business_hours" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."business_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_users_delete" ON "public"."business_users" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "business_users_insert" ON "public"."business_users" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "business_users_select" ON "public"."business_users" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "businesses_insert" ON "public"."businesses" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "businesses_select" ON "public"."businesses" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("id") OR "public"."is_platform_admin"()));



CREATE POLICY "businesses_update" ON "public"."businesses" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."caja_cortes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."caja_movimientos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "caja_movimientos_insert" ON "public"."caja_movimientos" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "caja_movimientos_select" ON "public"."caja_movimientos" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."caja_user_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "caja_user_assignments_delete" ON "public"."caja_user_assignments" FOR DELETE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "caja_user_assignments_insert" ON "public"."caja_user_assignments" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "caja_user_assignments_select" ON "public"."caja_user_assignments" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "caja_user_assignments_update" ON "public"."caja_user_assignments" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."cajas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cajas_delete" ON "public"."cajas" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "cajas_insert" ON "public"."cajas" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "cajas_select" ON "public"."cajas" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "cajas_update" ON "public"."cajas" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."campaign_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete" ON "public"."categories" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "categories_insert" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "categories_select" ON "public"."categories" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "categories_update" ON "public"."categories" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."chatbot_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatbot_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatbot_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatbot_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clock_allowed_origins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clock_allowed_origins_delete" ON "public"."clock_allowed_origins" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "clock_allowed_origins_insert" ON "public"."clock_allowed_origins" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "clock_allowed_origins_select" ON "public"."clock_allowed_origins" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "clock_allowed_origins_update" ON "public"."clock_allowed_origins" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."clock_blocked_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clock_blocked_attempts_delete" ON "public"."clock_blocked_attempts" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "clock_blocked_attempts_insert" ON "public"."clock_blocked_attempts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "clock_blocked_attempts_select" ON "public"."clock_blocked_attempts" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "clock_blocked_attempts_update" ON "public"."clock_blocked_attempts" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."clock_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clock_entries_select" ON "public"."clock_entries" FOR SELECT USING (("business_id" IN ( SELECT "business_users"."business_id"
   FROM "public"."business_users"
  WHERE (("business_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("business_users"."disabled_at" IS NULL)))));



ALTER TABLE "public"."comanda_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comanda_items_insert" ON "public"."comanda_items" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."comandas" "c"
     JOIN "public"."orders" "o" ON (("o"."id" = "c"."order_id")))
  WHERE (("c"."id" = "comanda_items"."comanda_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "comanda_items_select" ON "public"."comanda_items" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."comandas" "c"
     JOIN "public"."orders" "o" ON (("o"."id" = "c"."order_id")))
  WHERE (("c"."id" = "comanda_items"."comanda_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."comandas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comandas_insert" ON "public"."comandas" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "comandas"."order_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "comandas_select" ON "public"."comandas" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "comandas"."order_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "comandas_update" ON "public"."comandas" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "comandas"."order_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "comandas"."order_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."customer_addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_addresses_select" ON "public"."customer_addresses" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_addresses"."customer_id") AND "public"."is_business_member"("c"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_select" ON "public"."customers" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."daily_menu_components" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_menus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_message_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_message_templates_delete" ON "public"."delivery_message_templates" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "delivery_message_templates_insert" ON "public"."delivery_message_templates" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "delivery_message_templates_select" ON "public"."delivery_message_templates" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"() OR "public"."is_platform_admin"()));



CREATE POLICY "delivery_message_templates_update" ON "public"."delivery_message_templates" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id"))) WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



ALTER TABLE "public"."floor_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredient_consumptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredient_consumptions_delete" ON "public"."ingredient_consumptions" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "ingredient_consumptions_insert" ON "public"."ingredient_consumptions" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "ingredient_consumptions_select" ON "public"."ingredient_consumptions" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "ingredient_consumptions_update" ON "public"."ingredient_consumptions" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."ingredient_presentations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredient_presentations_delete" ON "public"."ingredient_presentations" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_presentations"."ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "ingredient_presentations_insert" ON "public"."ingredient_presentations" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_presentations"."ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "ingredient_presentations_select" ON "public"."ingredient_presentations" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_presentations"."ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"() OR "public"."is_platform_admin"()));



CREATE POLICY "ingredient_presentations_update" ON "public"."ingredient_presentations" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_presentations"."ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_presentations"."ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."ingredient_price_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredient_price_log_delete" ON "public"."ingredient_price_log" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "ingredient_price_log_insert" ON "public"."ingredient_price_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_price_log"."ingredient_id") AND "public"."is_business_member"("i"."business_id"))))));



CREATE POLICY "ingredient_price_log_select" ON "public"."ingredient_price_log" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_price_log"."ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "ingredient_price_log_update" ON "public"."ingredient_price_log" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."ingredient_recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredient_recipes_delete" ON "public"."ingredient_recipes" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_recipes"."parent_ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "ingredient_recipes_insert" ON "public"."ingredient_recipes" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_recipes"."parent_ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "ingredient_recipes_select" ON "public"."ingredient_recipes" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_recipes"."parent_ingredient_id") AND "public"."is_business_member"("i"."business_id"))))));



CREATE POLICY "ingredient_recipes_update" ON "public"."ingredient_recipes" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_recipes"."parent_ingredient_id") AND "public"."is_business_member"("i"."business_id")))))) WITH CHECK (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "ingredient_recipes"."parent_ingredient_id") AND "public"."is_business_member"("i"."business_id"))))));



ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredients_delete" ON "public"."ingredients" FOR DELETE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "ingredients_insert" ON "public"."ingredients" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "ingredients_select" ON "public"."ingredients" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "ingredients_update" ON "public"."ingredients" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_insert" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "invoices_select" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "invoices_update" ON "public"."invoices" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "members_insert_caja_cortes" ON "public"."caja_cortes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "members_select_caja_cortes" ON "public"."caja_cortes" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."modifier_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "modifier_groups_delete" ON "public"."modifier_groups" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "modifier_groups_insert" ON "public"."modifier_groups" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "modifier_groups_select" ON "public"."modifier_groups" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "modifier_groups_update" ON "public"."modifier_groups" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."modifiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "modifiers_delete" ON "public"."modifiers" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."modifier_groups" "g"
  WHERE (("g"."id" = "modifiers"."group_id") AND "public"."is_business_member"("g"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "modifiers_insert" ON "public"."modifiers" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."modifier_groups" "g"
  WHERE (("g"."id" = "modifiers"."group_id") AND "public"."is_business_member"("g"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "modifiers_select" ON "public"."modifiers" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."modifier_groups" "g"
  WHERE (("g"."id" = "modifiers"."group_id") AND "public"."is_business_member"("g"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "modifiers_update" ON "public"."modifiers" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."modifier_groups" "g"
  WHERE (("g"."id" = "modifiers"."group_id") AND "public"."is_business_member"("g"."business_id")))) OR "public"."is_platform_admin"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."modifier_groups" "g"
  WHERE (("g"."id" = "modifiers"."group_id") AND "public"."is_business_member"("g"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."mozo_rendiciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mozo_rendiciones_delete" ON "public"."mozo_rendiciones" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "mozo_rendiciones_insert" ON "public"."mozo_rendiciones" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "mozo_rendiciones_select" ON "public"."mozo_rendiciones" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"() OR "public"."is_platform_admin"()));



CREATE POLICY "mozo_rendiciones_update" ON "public"."mozo_rendiciones" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_delete" ON "public"."notification_preferences" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "notification_preferences_insert" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "notification_preferences_select" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "notification_preferences_update" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id"))) WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id"))) WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



ALTER TABLE "public"."order_item_modifiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_item_modifiers_select" ON "public"."order_item_modifiers" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."order_items" "i"
     JOIN "public"."orders" "o" ON (("o"."id" = "i"."order_id")))
  WHERE (("i"."id" = "order_item_modifiers"."order_item_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM (("public"."order_items" "i"
     JOIN "public"."orders" "o" ON (("o"."id" = "i"."order_id")))
     JOIN "public"."customers" "c" ON (("c"."id" = "o"."customer_id")))
  WHERE (("i"."id" = "order_item_modifiers"."order_item_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_select" ON "public"."order_items" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."customers" "c" ON (("c"."id" = "o"."customer_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."order_split_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_split_items_delete" ON "public"."order_split_items" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."order_splits" "s"
  WHERE (("s"."id" = "order_split_items"."split_id") AND "public"."is_business_member"("s"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "order_split_items_insert" ON "public"."order_split_items" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."order_splits" "s"
  WHERE (("s"."id" = "order_split_items"."split_id") AND "public"."is_business_member"("s"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "order_split_items_select" ON "public"."order_split_items" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."order_splits" "s"
  WHERE (("s"."id" = "order_split_items"."split_id") AND "public"."is_business_member"("s"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."order_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_splits_delete" ON "public"."order_splits" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "order_splits_insert" ON "public"."order_splits" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "order_splits_select" ON "public"."order_splits" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "order_splits_update" ON "public"."order_splits" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_status_history_select" ON "public"."order_status_history" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_status_history"."order_id") AND "public"."is_business_member"("o"."business_id")))) OR "public"."is_platform_admin"()));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_select" ON "public"."orders" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"() OR (("customer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "orders"."customer_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "orders_update" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."payment_method_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_method_configs_delete" ON "public"."payment_method_configs" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "payment_method_configs_insert" ON "public"."payment_method_configs" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "payment_method_configs_select" ON "public"."payment_method_configs" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "payment_method_configs_update" ON "public"."payment_method_configs" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_insert" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "payments_update" ON "public"."payments" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."phone_verification_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_delete_comanda_items" ON "public"."comanda_items" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "platform_delete_comandas" ON "public"."comandas" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete" ON "public"."products" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "products_insert" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "products_select" ON "public"."products" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "products_update" ON "public"."products" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_select_floor_plans" ON "public"."floor_plans" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "public_select_reservation_settings" ON "public"."reservation_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "public_select_tables" ON "public"."tables" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes_delete" ON "public"."recipes" FOR DELETE TO "authenticated" USING (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."ingredients" "i"
     JOIN "public"."recipes" "r_inner" ON (("r_inner"."ingredient_id" = "i"."id")))
  WHERE (("r_inner"."id" = "recipes"."id") AND "public"."is_business_member"("i"."business_id"))))));



CREATE POLICY "recipes_insert" ON "public"."recipes" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."ingredients" "i"
  WHERE (("i"."id" = "recipes"."ingredient_id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "recipes_select" ON "public"."recipes" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."ingredients" "i"
     JOIN "public"."recipes" "r_inner" ON (("r_inner"."ingredient_id" = "i"."id")))
  WHERE (("r_inner"."id" = "recipes"."id") AND "public"."is_business_member"("i"."business_id")))) OR "public"."is_platform_admin"()));



CREATE POLICY "recipes_update" ON "public"."recipes" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."ingredients" "i"
     JOIN "public"."recipes" "r_inner" ON (("r_inner"."ingredient_id" = "i"."id")))
  WHERE (("r_inner"."id" = "recipes"."id") AND "public"."is_business_member"("i"."business_id")))))) WITH CHECK (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."ingredients" "i"
     JOIN "public"."recipes" "r_inner" ON (("r_inner"."ingredient_id" = "i"."id")))
  WHERE (("r_inner"."id" = "recipes"."id") AND "public"."is_business_member"("i"."business_id"))))));



ALTER TABLE "public"."reservation_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservations_select" ON "public"."reservations" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "reservations_update" ON "public"."reservations" FOR UPDATE TO "authenticated" USING (("public"."is_business_staff"("business_id") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."is_business_staff"("business_id") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."stations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stations_delete" ON "public"."stations" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "stations_insert" ON "public"."stations" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "stations_select" ON "public"."stations" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "stations_update" ON "public"."stations" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."stock_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_items_delete" ON "public"."stock_items" FOR DELETE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "stock_items_insert" ON "public"."stock_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "stock_items_select" ON "public"."stock_items" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "stock_items_update" ON "public"."stock_items" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."stock_movimientos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movimientos_delete" ON "public"."stock_movimientos" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "stock_movimientos_insert" ON "public"."stock_movimientos" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "stock_movimientos_select" ON "public"."stock_movimientos" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"() OR "public"."is_platform_admin"()));



CREATE POLICY "stock_movimientos_update" ON "public"."stock_movimientos" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."super_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_categories_delete" ON "public"."super_categories" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "super_categories_insert" ON "public"."super_categories" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "super_categories_select" ON "public"."super_categories" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "super_categories_update" ON "public"."super_categories" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."supplier_ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_ingredients_delete" ON "public"."supplier_ingredients" FOR DELETE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "supplier_ingredients_insert" ON "public"."supplier_ingredients" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "supplier_ingredients_select" ON "public"."supplier_ingredients" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "supplier_ingredients_update" ON "public"."supplier_ingredients" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."supplier_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_invoices_delete" ON "public"."supplier_invoices" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "supplier_invoices_insert" ON "public"."supplier_invoices" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "supplier_invoices_select" ON "public"."supplier_invoices" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "supplier_invoices_update" ON "public"."supplier_invoices" FOR UPDATE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_delete" ON "public"."suppliers" FOR DELETE TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "suppliers_insert" ON "public"."suppliers" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "suppliers_select" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "suppliers_update" ON "public"."suppliers" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id"))) WITH CHECK (("public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tables_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tables_audit_log_insert" ON "public"."tables_audit_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



CREATE POLICY "tables_audit_log_select" ON "public"."tables_audit_log" FOR SELECT TO "authenticated" USING (("public"."is_business_member"("business_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select" ON "public"."users" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR ("id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."whatsapp_credentials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_credentials_delete" ON "public"."whatsapp_credentials" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "whatsapp_credentials_insert" ON "public"."whatsapp_credentials" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "whatsapp_credentials_select" ON "public"."whatsapp_credentials" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_platform_admin"()));



CREATE POLICY "whatsapp_credentials_update" ON "public"."whatsapp_credentials" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."whatsapp_outbox" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_outbox_delete" ON "public"."whatsapp_outbox" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "whatsapp_outbox_insert" ON "public"."whatsapp_outbox" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "whatsapp_outbox_select" ON "public"."whatsapp_outbox" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_platform_admin"() OR "public"."is_business_member"("business_id")));



CREATE POLICY "whatsapp_outbox_update" ON "public"."whatsapp_outbox" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."comandas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tables";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."ensure_default_super_categories"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_default_super_categories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_explode_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_explode_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_explode_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_ingredient_cost_per_unit"("p_ingredient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_ingredient_cost_per_unit"("p_ingredient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_ingredient_cost_per_unit"("p_ingredient_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_ingredient_price_change_log"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ingredient_price_change_log"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_recipe_stock_descuento"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_recipe_stock_descuento"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_recipe_stock_reversion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_recipe_stock_reversion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_stock_descuento_on_order_item"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_stock_descuento_on_order_item"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_promo_use"("p_promo_id" "uuid", "p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_promo_use"("p_promo_id" "uuid", "p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_business_member"("bid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_business_member"("bid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_member"("bid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_business_staff"("bid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_business_staff"("bid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_staff"("bid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_order_initial_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_order_initial_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_order_status_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_campaign_message_redeemed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_campaign_message_redeemed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_overdue_reservations_no_show"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_overdue_reservations_no_show"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
























GRANT ALL ON TABLE "public"."business_hours" TO "anon";
GRANT ALL ON TABLE "public"."business_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."business_hours" TO "service_role";



GRANT ALL ON TABLE "public"."business_users" TO "anon";
GRANT ALL ON TABLE "public"."business_users" TO "authenticated";
GRANT ALL ON TABLE "public"."business_users" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON TABLE "public"."caja_cortes" TO "anon";
GRANT ALL ON TABLE "public"."caja_cortes" TO "authenticated";
GRANT ALL ON TABLE "public"."caja_cortes" TO "service_role";



GRANT ALL ON TABLE "public"."caja_movimientos" TO "anon";
GRANT ALL ON TABLE "public"."caja_movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."caja_movimientos" TO "service_role";



GRANT ALL ON TABLE "public"."caja_user_assignments" TO "anon";
GRANT ALL ON TABLE "public"."caja_user_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."caja_user_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."cajas" TO "anon";
GRANT ALL ON TABLE "public"."cajas" TO "authenticated";
GRANT ALL ON TABLE "public"."cajas" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_messages" TO "anon";
GRANT ALL ON TABLE "public"."campaign_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_messages" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_configs" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_configs" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_contacts" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_conversations" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_messages" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_messages" TO "service_role";



GRANT ALL ON TABLE "public"."clock_allowed_origins" TO "anon";
GRANT ALL ON TABLE "public"."clock_allowed_origins" TO "authenticated";
GRANT ALL ON TABLE "public"."clock_allowed_origins" TO "service_role";



GRANT ALL ON TABLE "public"."clock_blocked_attempts" TO "anon";
GRANT ALL ON TABLE "public"."clock_blocked_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."clock_blocked_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."clock_entries" TO "anon";
GRANT ALL ON TABLE "public"."clock_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."clock_entries" TO "service_role";



GRANT ALL ON TABLE "public"."comanda_items" TO "anon";
GRANT ALL ON TABLE "public"."comanda_items" TO "authenticated";
GRANT ALL ON TABLE "public"."comanda_items" TO "service_role";



GRANT ALL ON TABLE "public"."comandas" TO "anon";
GRANT ALL ON TABLE "public"."comandas" TO "authenticated";
GRANT ALL ON TABLE "public"."comandas" TO "service_role";



GRANT ALL ON TABLE "public"."customer_addresses" TO "anon";
GRANT ALL ON TABLE "public"."customer_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."daily_menu_components" TO "anon";
GRANT ALL ON TABLE "public"."daily_menu_components" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_menu_components" TO "service_role";



GRANT ALL ON TABLE "public"."daily_menus" TO "anon";
GRANT ALL ON TABLE "public"."daily_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_menus" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_message_templates" TO "anon";
GRANT ALL ON TABLE "public"."delivery_message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_message_templates" TO "service_role";



GRANT ALL ON TABLE "public"."floor_plans" TO "anon";
GRANT ALL ON TABLE "public"."floor_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."floor_plans" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_consumptions" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_consumptions" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_consumptions" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_presentations" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_presentations" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_presentations" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_price_log" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_price_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_price_log" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_recipes" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."modifier_groups" TO "anon";
GRANT ALL ON TABLE "public"."modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."modifier_groups" TO "service_role";



GRANT ALL ON TABLE "public"."modifiers" TO "anon";
GRANT ALL ON TABLE "public"."modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."mozo_rendiciones" TO "anon";
GRANT ALL ON TABLE "public"."mozo_rendiciones" TO "authenticated";
GRANT ALL ON TABLE "public"."mozo_rendiciones" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."order_item_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."order_item_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."order_item_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_split_items" TO "anon";
GRANT ALL ON TABLE "public"."order_split_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_split_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_splits" TO "anon";
GRANT ALL ON TABLE "public"."order_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."order_splits" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_method_configs" TO "anon";
GRANT ALL ON TABLE "public"."payment_method_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_method_configs" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."phone_verification_codes" TO "anon";
GRANT ALL ON TABLE "public"."phone_verification_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_verification_codes" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."promo_codes" TO "anon";
GRANT ALL ON TABLE "public"."promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_settings" TO "anon";
GRANT ALL ON TABLE "public"."reservation_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_settings" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "anon";
GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."stations" TO "anon";
GRANT ALL ON TABLE "public"."stations" TO "authenticated";
GRANT ALL ON TABLE "public"."stations" TO "service_role";



GRANT ALL ON TABLE "public"."stock_items" TO "anon";
GRANT ALL ON TABLE "public"."stock_items" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_items" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movimientos" TO "anon";
GRANT ALL ON TABLE "public"."stock_movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movimientos" TO "service_role";



GRANT ALL ON TABLE "public"."super_categories" TO "anon";
GRANT ALL ON TABLE "public"."super_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."super_categories" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."supplier_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_invoices" TO "anon";
GRANT ALL ON TABLE "public"."supplier_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."tables_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."tables_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."tables_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_credentials" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































