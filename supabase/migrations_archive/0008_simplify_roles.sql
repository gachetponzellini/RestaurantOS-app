-- ============================================
-- Simplify business_users roles.
--
-- The "owner" role was redundant: the platform admin always creates the
-- business, so they are the de-facto owner via `users.is_platform_admin`.
-- Inside a business we keep just two roles:
--   - admin : can manage catalog, orders, team
--   - staff : operational (can manage orders, limited mutations)
--
-- Migrate any existing 'owner' rows to 'admin' and tighten the CHECK.
-- ============================================

update business_users set role = 'admin' where role = 'owner';

alter table business_users drop constraint business_users_role_check;

alter table business_users
  add constraint business_users_role_check
  check (role in ('admin','staff'));
