-- RANOVA country-aware marketplace finance rules + hourly sync
-- Applied to Supabase on 2026-09-26.

create table if not exists public.ranova_marketplace_country_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.ranova_seller_stores(id) on delete cascade,
  seller_country_code text,
  buyer_country_code text,
  payment_method text,
  commission_rate numeric(5,2) not null default 0
    check (commission_rate >= 0 and commission_rate <= 100),
  required_payment_percent numeric(5,2) not null default 100
    check (required_payment_percent >= 0 and required_payment_percent <= 100),
  payment_processing_rate numeric(5,2) not null default 0
    check (payment_processing_rate >= 0 and payment_processing_rate <= 100),
  payment_fixed_fee numeric(14,2) not null default 0 check (payment_fixed_fee >= 0),
  payment_fee_payer text not null default 'platform'
    check (payment_fee_payer in ('platform','buyer','seller')),
  currency text not null default 'GHS',
  source_name text,
  source_url text,
  source_kind text not null default 'owner_policy'
    check (source_kind in ('owner_policy','payment_provider','tax_authority','other_official')),
  auto_update boolean not null default false,
  last_checked_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  source_etag text,
  source_last_modified text,
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (seller_country_code is null or seller_country_code ~ '^[A-Z]{2}$'),
  check (buyer_country_code is null or buyer_country_code ~ '^[A-Z]{2}$')
);

create unique index if not exists uq_ranova_country_rule_scope
on public.ranova_marketplace_country_rules(
  coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(seller_country_code,'*'),
  coalesce(buyer_country_code,'*'),
  coalesce(payment_method,'*')
);

insert into public.ranova_marketplace_country_rules (
  store_id,seller_country_code,buyer_country_code,payment_method,
  commission_rate,required_payment_percent,payment_processing_rate,payment_fixed_fee,
  payment_fee_payer,currency,source_name,source_kind,auto_update,active
)
values (null,null,null,null,0,100,0,0,'platform','GHS','RANOVA global default','owner_policy',false,true)
on conflict do nothing;

alter table public.ranova_seller_stores
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists google_place_id text,
  add column if not exists country_source text;

alter table public.ranova_customer_orders
  add column if not exists buyer_country_code text,
  add column if not exists buyer_country_name text,
  add column if not exists buyer_google_place_id text,
  add column if not exists required_payment_percent numeric(5,2),
  add column if not exists payment_processing_rate numeric(5,2),
  add column if not exists payment_processing_fee numeric(14,2),
  add column if not exists payment_fee_payer text,
  add column if not exists country_rule_ids uuid[];

alter table public.ranova_seller_orders
  add column if not exists seller_country_code text,
  add column if not exists seller_country_name text,
  add column if not exists buyer_country_code text,
  add column if not exists buyer_country_name text,
  add column if not exists country_rule_id uuid references public.ranova_marketplace_country_rules(id) on delete set null,
  add column if not exists commission_rate_snapshot numeric(5,2),
  add column if not exists required_payment_percent_snapshot numeric(5,2),
  add column if not exists payment_processing_rate_snapshot numeric(5,2),
  add column if not exists payment_fixed_fee_snapshot numeric(14,2),
  add column if not exists payment_fee_payer_snapshot text;

alter table public.ranova_seller_payouts
  add column if not exists country_rule_id uuid references public.ranova_marketplace_country_rules(id) on delete set null,
  add column if not exists seller_country_code text,
  add column if not exists buyer_country_code text,
  add column if not exists payment_processing_rate numeric(5,2) not null default 0,
  add column if not exists payment_processing_fee numeric(14,2) not null default 0,
  add column if not exists payment_fee_payer text not null default 'platform';

alter table public.ranova_marketplace_country_rules enable row level security;
revoke all on public.ranova_marketplace_country_rules from anon, authenticated;

create index if not exists idx_ranova_country_rules_active
  on public.ranova_marketplace_country_rules(active,effective_from desc);
create index if not exists idx_ranova_country_rules_store
  on public.ranova_marketplace_country_rules(store_id);
create index if not exists idx_ranova_seller_stores_country
  on public.ranova_seller_stores(country_code);
create index if not exists idx_ranova_customer_orders_buyer_country
  on public.ranova_customer_orders(buyer_country_code);
create index if not exists idx_ranova_seller_orders_country_pair
  on public.ranova_seller_orders(seller_country_code,buyer_country_code);

create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='ranova-country-rate-sync-hourly' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'ranova-country-rate-sync-hourly',
  '7 * * * *',
  $cron$
    select net.http_post(
      url:='https://igaerssbzobutlwvjfwt.supabase.co/functions/v1/ranova-rate-sync',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr',
        'x-ranova-client','ranova-site-v1'
      ),
      body:='{"force":false}'::jsonb,
      timeout_milliseconds:=15000
    ) as request_id;
  $cron$
);
