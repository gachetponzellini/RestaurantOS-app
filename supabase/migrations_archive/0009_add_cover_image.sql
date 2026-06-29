-- ============================================
-- Storefront cover photo.
--
-- `logo_url` stays as the brand mark (small avatar/badge).
-- `cover_image_url` is the wide hero / storefront photo used on the
-- public menu as the top banner.
-- ============================================

alter table businesses add column cover_image_url text;
