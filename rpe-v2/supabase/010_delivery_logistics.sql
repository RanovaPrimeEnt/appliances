-- RANOVA Step 9: delivery & logistics
-- Applied to Supabase on 2026-09-26.

create table if not exists public.ranova_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.ranova_seller_stores(id) on delete cascade,
  zone_name text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  area_description text,
  fulfilment_method text not null default 'seller_delivery'
    check (fulfilment_method in ('seller_delivery','third_party_courier','ranova_delivery','pickup')),
  pricing_type text not null default 'quote'
    check (pricing_type in ('quote','fixed','free')),
  fixed_fee numeric(14,2) check (fixed_fee is null or fixed_fee >= 0),
  currency text not null default 'GHS',
  eta_min_days integer check (eta_min_days is null or eta_min_days >= 0),
  eta_max_days integer check (eta_max_days is null or eta_max_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (eta_min_days is null or eta_max_days is null or eta_max_days >= eta_min_days),
  check ((pricing_type='fixed' and fixed_fee is not null) or pricing_type<>'fixed')
);
create unique index if not exists uq_ranova_delivery_zone_name
  on public.ranova_delivery_zones(store_id,lower(zone_name)) where active=true;

create table if not exists public.ranova_order_deliveries (
  id uuid primary key default gen_random_uuid(),
  customer_order_id uuid references public.ranova_customer_orders(id) on delete cascade,
  seller_order_id uuid not null unique references public.ranova_seller_orders(id) on delete cascade,
  store_id uuid not null references public.ranova_seller_stores(id) on delete cascade,
  zone_id uuid references public.ranova_delivery_zones(id) on delete set null,
  responsibility text not null default 'seller'
    check (responsibility in ('seller','ranova','third_party','buyer_pickup')),
  fulfilment_method text not null default 'seller_delivery'
    check (fulfilment_method in ('seller_delivery','third_party_courier','ranova_delivery','pickup')),
  delivery_status text not null default 'pending_quote'
    check (delivery_status in ('pending_quote','awaiting_dispatch','assigned','picked_up','in_transit','out_for_delivery','delivered_pending_confirmation','delivered_confirmed','failed_attempt','returned','cancelled')),
  quoted_delivery_fee numeric(14,2) check (quoted_delivery_fee is null or quoted_delivery_fee >= 0),
  currency text not null default 'GHS',
  destination_text text,
  courier_name text,
  courier_phone text,
  courier_reference text,
  tracking_url text,
  eta_start_date date,
  eta_end_date date,
  proof_required boolean not null default true,
  proof_verified boolean not null default false,
  proof_verified_at timestamptz,
  proof_verified_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  dispatched_at timestamptz,
  picked_up_at timestamptz,
  out_for_delivery_at timestamptz,
  seller_marked_delivered_at timestamptz,
  buyer_confirmed_at timestamptz,
  admin_confirmed_at timestamptz,
  delivered_at timestamptz,
  delivery_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (eta_start_date is null or eta_end_date is null or eta_end_date >= eta_start_date)
);

create table if not exists public.ranova_delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.ranova_order_deliveries(id) on delete cascade,
  seller_order_id uuid not null references public.ranova_seller_orders(id) on delete cascade,
  status text not null,
  actor_type text not null check (actor_type in ('system','seller','buyer','admin','courier')),
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  location_text text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.ranova_delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.ranova_order_deliveries(id) on delete cascade,
  seller_order_id uuid not null references public.ranova_seller_orders(id) on delete cascade,
  proof_type text not null default 'photo'
    check (proof_type in ('photo','courier_receipt','recipient_name','signature','other')),
  storage_path text,
  recipient_name text,
  note text,
  uploaded_by_type text not null check (uploaded_by_type in ('seller','admin','courier')),
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  captured_at timestamptz,
  review_status text not null default 'submitted'
    check (review_status in ('submitted','verified','rejected')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (storage_path is not null or recipient_name is not null or note is not null)
);

create index if not exists idx_ranova_delivery_zones_store on public.ranova_delivery_zones(store_id,active,zone_name);
create index if not exists idx_ranova_order_deliveries_status on public.ranova_order_deliveries(delivery_status,updated_at desc);
create index if not exists idx_ranova_order_deliveries_customer on public.ranova_order_deliveries(customer_order_id,created_at);
create index if not exists idx_ranova_delivery_events_delivery on public.ranova_delivery_events(delivery_id,occurred_at);
create index if not exists idx_ranova_delivery_proofs_delivery on public.ranova_delivery_proofs(delivery_id,created_at);

alter table public.ranova_delivery_zones enable row level security;
alter table public.ranova_order_deliveries enable row level security;
alter table public.ranova_delivery_events enable row level security;
alter table public.ranova_delivery_proofs enable row level security;
revoke all on public.ranova_delivery_zones from anon,authenticated;
revoke all on public.ranova_order_deliveries from anon,authenticated;
revoke all on public.ranova_delivery_events from anon,authenticated;
revoke all on public.ranova_delivery_proofs from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ranova-delivery-proof','ranova-delivery-proof',false,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types,updated_at=now();

create or replace function private.ranova_create_delivery_ledger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  insert into public.ranova_order_deliveries(
    customer_order_id,seller_order_id,store_id,destination_text,quoted_delivery_fee,delivery_status,proof_required
  ) values (
    new.parent_order_id,new.id,new.store_id,new.delivery_location,new.delivery_fee,'pending_quote',true
  )
  on conflict (seller_order_id) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.ranova_delivery_events(delivery_id,seller_order_id,status,actor_type,note)
    values (v_id,new.id,'pending_quote','system','Delivery record created with the seller order.');
  end if;
  return new;
end $$;

drop trigger if exists trg_ranova_create_delivery_ledger on public.ranova_seller_orders;
create trigger trg_ranova_create_delivery_ledger
after insert on public.ranova_seller_orders
for each row execute function private.ranova_create_delivery_ledger();

with ins as (
  insert into public.ranova_order_deliveries(
    customer_order_id,seller_order_id,store_id,destination_text,
    quoted_delivery_fee,delivery_status,proof_required
  )
  select so.parent_order_id,so.id,so.store_id,so.delivery_location,
         so.delivery_fee,
         case
           when so.order_status='delivered' then 'delivered_confirmed'
           when so.order_status='dispatched' then 'in_transit'
           when so.order_status='ready_for_dispatch' then 'awaiting_dispatch'
           when so.order_status='cancelled' then 'cancelled'
           when so.order_status='returned' then 'returned'
           else 'pending_quote'
         end,
         true
  from public.ranova_seller_orders so
  where not exists (
    select 1 from public.ranova_order_deliveries d where d.seller_order_id=so.id
  )
  returning id,seller_order_id,delivery_status
)
insert into public.ranova_delivery_events(delivery_id,seller_order_id,status,actor_type,note)
select id,seller_order_id,delivery_status,'system','Existing order backfilled into delivery ledger.'
from ins;

create or replace function private.ranova_refresh_payout_eligibility()
returns void
language sql
security definer
set search_path=public,pg_temp
as $$
  update public.ranova_seller_payouts p
     set payout_status='eligible',
         payout_note=case when coalesce(p.payout_note,'')='' then 'Delivery confirmed, hold period satisfied and no open case.' else p.payout_note end,
         updated_at=now()
   where p.payout_status='pending'
     and (p.eligible_at is null or p.eligible_at<=now())
     and exists (
       select 1 from public.ranova_order_deliveries d
       where d.seller_order_id=p.seller_order_id and d.delivery_status='delivered_confirmed'
     )
     and not exists (
       select 1 from public.ranova_seller_orders so
       join public.ranova_marketplace_refunds r on r.customer_order_id=so.parent_order_id
       where so.id=p.seller_order_id and r.status in ('requested','under_review','approved','processing')
     )
     and not exists (
       select 1 from public.ranova_seller_orders so
       join public.ranova_marketplace_disputes d on d.customer_order_id=so.parent_order_id
       where so.id=p.seller_order_id and d.status in ('open','awaiting_buyer','awaiting_seller','under_review')
     );
$$;
revoke all on function private.ranova_refresh_payout_eligibility() from public;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='ranova-payout-eligibility' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'ranova-payout-eligibility',
  '*/15 * * * *',
  $$select private.ranova_refresh_payout_eligibility();$$
);
