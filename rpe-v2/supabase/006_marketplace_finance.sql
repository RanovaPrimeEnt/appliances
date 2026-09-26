-- RANOVA Marketplace finance, commission and seller payout foundation
-- Applied to Supabase on 2026-09-26.

create table if not exists public.ranova_marketplace_finance_settings (
  id smallint primary key default 1 check (id=1),
  default_commission_rate numeric(5,2) not null default 0
    check (default_commission_rate >= 0 and default_commission_rate <= 100),
  payout_hold_days integer not null default 0 check (payout_hold_days >= 0 and payout_hold_days <= 90),
  currency text not null default 'GHS',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.ranova_marketplace_finance_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.ranova_marketplace_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  payment_method text not null check (payment_method in ('Mobile Money','Bank Transfer')),
  provider_name text not null,
  account_name text not null,
  account_reference text not null,
  instructions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.ranova_seller_finance_profiles (
  seller_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null unique references public.ranova_seller_stores(id) on delete cascade,
  payout_method text not null check (payout_method in ('Mobile Money','Bank Transfer')),
  provider_name text not null,
  account_name text not null,
  account_reference text not null,
  commission_rate_override numeric(5,2)
    check (commission_rate_override is null or (commission_rate_override >= 0 and commission_rate_override <= 100)),
  updated_at timestamptz not null default now()
);

create table if not exists public.ranova_marketplace_payments (
  id uuid primary key default gen_random_uuid(),
  parent_order_id uuid not null unique references public.ranova_customer_orders(id) on delete cascade,
  order_ref text not null unique,
  amount numeric(14,2),
  currency text not null default 'GHS',
  payment_method text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','confirmed','failed','refunded','partially_refunded')),
  payer_reference text,
  admin_note text,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ranova_seller_payouts (
  id uuid primary key default gen_random_uuid(),
  seller_order_id uuid not null unique references public.ranova_seller_orders(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.ranova_seller_stores(id) on delete cascade,
  platform_order_ref text,
  seller_order_ref text not null,
  gross_product_amount numeric(14,2) not null default 0,
  delivery_fee numeric(14,2) not null default 0,
  commission_rate numeric(5,2) not null default 0
    check (commission_rate >= 0 and commission_rate <= 100),
  commission_amount numeric(14,2) not null default 0,
  adjustment_amount numeric(14,2) not null default 0,
  payout_amount numeric(14,2) not null default 0,
  currency text not null default 'GHS',
  payout_status text not null default 'pending'
    check (payout_status in ('pending','eligible','held','processing','paid','cancelled')),
  eligible_at timestamptz,
  payout_reference text,
  payout_note text,
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ranova_marketplace_payments_status
  on public.ranova_marketplace_payments(payment_status, created_at desc);
create index if not exists idx_ranova_seller_payouts_seller
  on public.ranova_seller_payouts(seller_id, created_at desc);
create index if not exists idx_ranova_seller_payouts_status
  on public.ranova_seller_payouts(payout_status, created_at desc);

alter table public.ranova_marketplace_finance_settings enable row level security;
alter table public.ranova_marketplace_payment_accounts enable row level security;
alter table public.ranova_seller_finance_profiles enable row level security;
alter table public.ranova_marketplace_payments enable row level security;
alter table public.ranova_seller_payouts enable row level security;

revoke all on public.ranova_marketplace_finance_settings from anon, authenticated;
revoke all on public.ranova_marketplace_payment_accounts from anon, authenticated;
revoke all on public.ranova_seller_finance_profiles from anon, authenticated;
revoke all on public.ranova_marketplace_payments from anon, authenticated;
revoke all on public.ranova_seller_payouts from anon, authenticated;
