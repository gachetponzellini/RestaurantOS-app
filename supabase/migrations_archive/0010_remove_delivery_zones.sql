-- ============================================
-- Remove delivery_zones complexity.
--
-- Multiple zones per business was overkill for the MVP. We collapse it to a
-- single flat fee + optional minimum + optional ETA on each business.
--
-- - Add `delivery_fee_cents`, `min_order_cents`, `estimated_delivery_minutes`
--   columns to `businesses`.
-- - Backfill from the first active zone of each business (lowest sort_order).
-- - Drop the `delivery_zone_id` column from `orders` and `customer_addresses`.
-- - Drop the `delivery_zones` table (cascades policies + FKs).
--
-- Orders keep their historical `delivery_fee_cents` snapshot column, so
-- existing order totals are preserved.
-- ============================================

alter table businesses
  add column delivery_fee_cents bigint not null default 0,
  add column min_order_cents bigint not null default 0,
  add column estimated_delivery_minutes int;

update businesses b
set
  delivery_fee_cents = sub.delivery_fee_cents,
  min_order_cents = coalesce(sub.min_order_cents, 0),
  estimated_delivery_minutes = sub.estimated_minutes
from (
  select distinct on (business_id)
    business_id,
    delivery_fee_cents,
    min_order_cents,
    estimated_minutes
  from delivery_zones
  where is_active = true
  order by business_id, sort_order
) sub
where sub.business_id = b.id;

alter table customer_addresses drop column delivery_zone_id;
alter table orders drop column delivery_zone_id;

drop table delivery_zones cascade;
