-- RANOVA Marketplace moderation audit fields
-- Applied to Supabase on 2026-09-26.

alter table public.ranova_seller_applications
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.ranova_seller_verification_files
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.ranova_seller_products
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null;

alter table public.ranova_seller_stores
  add column if not exists moderation_note text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null;

create index if not exists idx_ranova_seller_applications_reviewed_by
  on public.ranova_seller_applications(reviewed_by);
create index if not exists idx_ranova_seller_products_moderated_by
  on public.ranova_seller_products(moderated_by);
