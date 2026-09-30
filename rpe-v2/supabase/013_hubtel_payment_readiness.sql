-- RANOVA Ghana payment-provider readiness foundation (Hubtel-first).
-- Safe to apply before live Hubtel credentials are issued.
-- No real-money provider call is made by this migration.

alter table public.ranova_marketplace_payments
  add column if not exists provider text,
  add column if not exists provider_reference text,
  add column if not exists provider_status text,
  add column if not exists provider_payload jsonb,
  add column if not exists initialized_at timestamptz,
  add column if not exists verified_at timestamptz;

alter table public.ranova_seller_payouts
  add column if not exists provider text,
  add column if not exists recipient_code text,
  add column if not exists provider_transfer_code text,
  add column if not exists provider_status text,
  add column if not exists provider_payload jsonb,
  add column if not exists initiated_at timestamptz;

alter table public.ranova_seller_finance_profiles
  add column if not exists recipient_code text,
  add column if not exists payout_account_verified boolean not null default false,
  add column if not exists payout_account_masked text,
  add column if not exists payout_account_verified_at timestamptz;

create table if not exists public.ranova_payment_provider_events (
  id bigserial primary key,
  provider text not null,
  event_key text not null,
  event_type text not null,
  provider_reference text,
  order_ref text,
  payout_id uuid references public.ranova_seller_payouts(id) on delete set null,
  payload jsonb,
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','ignored','failed')),
  processing_note text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,event_key)
);

create table if not exists public.ranova_payout_attempts (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.ranova_seller_payouts(id) on delete cascade,
  provider text not null,
  attempt_key text not null unique,
  provider_reference text,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'GHS',
  status text not null default 'created'
    check (status in ('created','submitted','processing','paid','failed','cancelled')),
  provider_payload jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ranova_payment_provider_events_order_idx
  on public.ranova_payment_provider_events(order_ref,received_at desc);
create index if not exists ranova_payment_provider_events_reference_idx
  on public.ranova_payment_provider_events(provider,provider_reference);
create index if not exists ranova_payout_attempts_payout_idx
  on public.ranova_payout_attempts(payout_id,created_at desc);

alter table public.ranova_payment_provider_events enable row level security;
alter table public.ranova_payout_attempts enable row level security;
revoke all on public.ranova_payment_provider_events from anon, authenticated;
revoke all on public.ranova_payout_attempts from anon, authenticated;

comment on table public.ranova_payment_provider_events is
  'Server-only immutable-ish provider event ledger used for idempotent payment/payout processing.';
comment on table public.ranova_payout_attempts is
  'Server-only payout attempt ledger. A payout may have multiple retry attempts but only one paid outcome.';
