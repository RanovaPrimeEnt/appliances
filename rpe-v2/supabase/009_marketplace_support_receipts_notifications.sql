-- RANOVA Step 8: notifications, immutable receipts, refunds and disputes
-- Applied to Supabase on 2026-09-26.

create table if not exists public.ranova_marketplace_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('buyer','seller','admin')),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_email text,
  customer_order_id uuid references public.ranova_customer_orders(id) on delete cascade,
  seller_order_id uuid references public.ranova_seller_orders(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  in_app_visible boolean not null default true,
  email_requested boolean not null default false,
  email_status text not null default 'not_requested'
    check (email_status in ('not_requested','queued','sent','skipped_no_provider','failed')),
  email_attempted_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ranova_marketplace_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_ref text not null unique,
  customer_order_id uuid not null unique references public.ranova_customer_orders(id) on delete cascade,
  order_ref text not null,
  customer_name text not null,
  customer_email text,
  buyer_country_code text,
  buyer_country_name text,
  payment_method text,
  payment_reference text,
  product_total numeric(14,2),
  delivery_fee numeric(14,2),
  buyer_processing_fee numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null,
  currency text not null default 'GHS',
  finance_disclosure_version integer not null default 1,
  finance_rule_ids uuid[],
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb
);

create table if not exists public.ranova_marketplace_refunds (
  id uuid primary key default gen_random_uuid(),
  refund_ref text not null unique,
  customer_order_id uuid not null references public.ranova_customer_orders(id) on delete cascade,
  seller_order_id uuid references public.ranova_seller_orders(id) on delete set null,
  requested_by text not null check (requested_by in ('buyer','seller','admin')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_amount numeric(14,2) check (requested_amount is null or requested_amount >= 0),
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount >= 0),
  currency text not null default 'GHS',
  reason_category text not null,
  reason_detail text not null,
  status text not null default 'requested'
    check (status in ('requested','under_review','approved','rejected','processing','refunded','cancelled')),
  admin_note text,
  refund_reference text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  refunded_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ranova_marketplace_disputes (
  id uuid primary key default gen_random_uuid(),
  dispute_ref text not null unique,
  customer_order_id uuid not null references public.ranova_customer_orders(id) on delete cascade,
  seller_order_id uuid references public.ranova_seller_orders(id) on delete set null,
  opened_by text not null check (opened_by in ('buyer','seller','admin')),
  opened_by_user_id uuid references auth.users(id) on delete set null,
  category text not null,
  subject text not null,
  description text not null,
  status text not null default 'open'
    check (status in ('open','awaiting_buyer','awaiting_seller','under_review','resolved','closed')),
  resolution text,
  resolution_note text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ranova_marketplace_dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.ranova_marketplace_disputes(id) on delete cascade,
  sender_type text not null check (sender_type in ('buyer','seller','admin')),
  sender_user_id uuid references auth.users(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.ranova_marketplace_notifications enable row level security;
alter table public.ranova_marketplace_receipts enable row level security;
alter table public.ranova_marketplace_refunds enable row level security;
alter table public.ranova_marketplace_disputes enable row level security;
alter table public.ranova_marketplace_dispute_messages enable row level security;

revoke all on public.ranova_marketplace_notifications from anon, authenticated;
revoke all on public.ranova_marketplace_receipts from anon, authenticated;
revoke all on public.ranova_marketplace_refunds from anon, authenticated;
revoke all on public.ranova_marketplace_disputes from anon, authenticated;
revoke all on public.ranova_marketplace_dispute_messages from anon, authenticated;

create index if not exists idx_ranova_notifications_seller on public.ranova_marketplace_notifications(recipient_user_id,created_at desc);
create index if not exists idx_ranova_notifications_customer_order on public.ranova_marketplace_notifications(customer_order_id,created_at desc);
create index if not exists idx_ranova_notifications_email_queue on public.ranova_marketplace_notifications(email_status,created_at) where email_requested=true;
create index if not exists idx_ranova_refunds_order on public.ranova_marketplace_refunds(customer_order_id,requested_at desc);
create index if not exists idx_ranova_refunds_status on public.ranova_marketplace_refunds(status,requested_at desc);
create index if not exists idx_ranova_disputes_order on public.ranova_marketplace_disputes(customer_order_id,opened_at desc);
create index if not exists idx_ranova_disputes_status on public.ranova_marketplace_disputes(status,opened_at desc);
create index if not exists idx_ranova_dispute_messages on public.ranova_marketplace_dispute_messages(dispute_id,created_at);

-- Notification and receipt triggers are created in the live database.
-- Email dispatch runs every 5 minutes through pg_cron and ranova-notify-dispatch.
