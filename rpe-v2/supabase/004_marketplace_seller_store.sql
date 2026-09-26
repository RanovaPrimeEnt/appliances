-- RANOVA marketplace seller Store Builder foundation
-- Applied to Supabase on 2026-09-26.

create or replace function public.is_approved_ranova_seller(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ranova_seller_accounts a
    join public.ranova_seller_applications app
      on app.application_ref = a.application_ref
    where a.user_id = p_user_id
      and lower(coalesce(app.verification_status, app.status, '')) = 'approved'
  );
$$;

revoke all on function public.is_approved_ranova_seller(uuid) from public;
grant execute on function public.is_approved_ranova_seller(uuid) to anon, authenticated;

create table if not exists public.ranova_seller_stores (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references auth.users(id) on delete cascade,
  application_ref text not null unique references public.ranova_seller_applications(application_ref) on delete cascade,
  store_name text not null,
  slug text not null unique,
  tagline text,
  description text,
  logo_url text,
  banner_url text,
  public_phone text,
  public_email text,
  business_location text,
  fulfilment_summary text,
  return_policy_summary text,
  minimum_order_note text,
  store_status text not null default 'draft'
    check (store_status in ('draft','active','paused','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ranova_seller_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.ranova_seller_stores(id) on delete cascade,
  name text not null,
  slug text not null,
  sku text,
  category text not null,
  short_description text,
  description text,
  price numeric(14,2),
  currency text not null default 'GHS',
  moq integer not null default 1 check (moq >= 1),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  stock_status text not null default 'confirm_on_enquiry'
    check (stock_status in ('in_stock','low_stock','out_of_stock','preorder','confirm_on_enquiry')),
  unit_label text,
  primary_image_url text,
  image_urls text[] not null default '{}',
  product_status text not null default 'draft'
    check (product_status in ('draft','pending_review','active','paused','rejected','archived')),
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, slug),
  unique(store_id, sku)
);

create table if not exists public.ranova_seller_orders (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null unique,
  seller_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.ranova_seller_stores(id) on delete cascade,
  buyer_name text,
  buyer_phone text,
  buyer_email text,
  delivery_location text,
  items jsonb not null default '[]'::jsonb,
  item_count integer not null default 0 check (item_count >= 0),
  subtotal numeric(14,2),
  delivery_fee numeric(14,2),
  total numeric(14,2),
  currency text not null default 'GHS',
  payment_status text not null default 'not_started'
    check (payment_status in ('not_started','pending','paid','failed','refunded')),
  order_status text not null default 'new'
    check (order_status in ('new','confirmed','preparing','ready_for_dispatch','dispatched','delivered','cancelled','return_requested','returned')),
  buyer_note text,
  seller_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ranova_seller_products_seller
  on public.ranova_seller_products(seller_id, created_at desc);
create index if not exists idx_ranova_seller_products_store_status
  on public.ranova_seller_products(store_id, product_status, created_at desc);
create index if not exists idx_ranova_seller_orders_seller
  on public.ranova_seller_orders(seller_id, created_at desc);
create index if not exists idx_ranova_seller_orders_store
  on public.ranova_seller_orders(store_id, created_at desc);

alter table public.ranova_seller_stores enable row level security;
alter table public.ranova_seller_products enable row level security;
alter table public.ranova_seller_orders enable row level security;

grant select on public.ranova_seller_stores to anon, authenticated;
grant select on public.ranova_seller_products to anon, authenticated;
grant select on public.ranova_seller_orders to authenticated;

create policy "Public can view active seller stores"
on public.ranova_seller_stores for select to anon, authenticated
using (store_status='active' and public.is_approved_ranova_seller(seller_id));

create policy "Seller can view own store"
on public.ranova_seller_stores for select to authenticated
using (seller_id=auth.uid());

create policy "Public can view active seller products"
on public.ranova_seller_products for select to anon, authenticated
using (
  product_status='active'
  and public.is_approved_ranova_seller(seller_id)
  and exists (
    select 1 from public.ranova_seller_stores s
    where s.id=store_id and s.store_status='active'
  )
);

create policy "Seller can view own products"
on public.ranova_seller_products for select to authenticated
using (seller_id=auth.uid());

create policy "Seller can view own orders"
on public.ranova_seller_orders for select to authenticated
using (seller_id=auth.uid());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('seller-store-assets','seller-store-assets',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create policy "Approved sellers can upload store assets"
on storage.objects for insert to authenticated
with check (
  bucket_id='seller-store-assets'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.is_approved_ranova_seller(auth.uid())
);

create policy "Approved sellers can update own store assets"
on storage.objects for update to authenticated
using (bucket_id='seller-store-assets' and owner_id=auth.uid()::text)
with check (
  bucket_id='seller-store-assets'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.is_approved_ranova_seller(auth.uid())
);

create policy "Approved sellers can delete own store assets"
on storage.objects for delete to authenticated
using (bucket_id='seller-store-assets' and owner_id=auth.uid()::text);
