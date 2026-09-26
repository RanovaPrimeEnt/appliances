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

create or replace function private.ranova_queue_marketplace_notification(
  p_recipient_type text,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_customer_order_id uuid,
  p_seller_order_id uuid,
  p_notification_type text,
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $
declare v_id uuid;
begin
  insert into public.ranova_marketplace_notifications(
    recipient_type,recipient_user_id,recipient_email,customer_order_id,seller_order_id,
    notification_type,title,message,metadata,in_app_visible,email_requested,email_status
  ) values (
    p_recipient_type,p_recipient_user_id,nullif(trim(p_recipient_email),''),
    p_customer_order_id,p_seller_order_id,p_notification_type,p_title,p_message,coalesce(p_metadata,'{}'::jsonb),
    true,
    nullif(trim(p_recipient_email),'') is not null,
    case when nullif(trim(p_recipient_email),'') is not null then 'queued' else 'not_requested' end
  )
  returning id into v_id;
  return v_id;
end $;

revoke all on function private.ranova_queue_marketplace_notification(text,uuid,text,uuid,uuid,text,text,text,jsonb) from public;

create or replace function private.ranova_notify_new_customer_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $
begin
  perform private.ranova_queue_marketplace_notification(
    'buyer',null,new.customer_email,new.id,null,
    'order_created','RANOVA order received',
    'Your order '||new.order_ref||' has been received. Keep this order reference and your phone number for tracking and support.',
    jsonb_build_object('order_ref',new.order_ref,'status',new.status)
  );
  return new;
end $;

drop trigger if exists trg_ranova_notify_new_customer_order on public.ranova_customer_orders;
create trigger trg_ranova_notify_new_customer_order
after insert on public.ranova_customer_orders
for each row execute function private.ranova_notify_new_customer_order();

create or replace function private.ranova_notify_new_seller_order()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $
declare v_email text;
begin
  select email into v_email from auth.users where id=new.seller_id;
  perform private.ranova_queue_marketplace_notification(
    'seller',new.seller_id,v_email,new.parent_order_id,new.id,
    'new_order','New RANOVA marketplace order',
    'A new marketplace order '||coalesce(new.platform_order_ref,new.order_ref)||' has been routed to your store.',
    jsonb_build_object('order_ref',coalesce(new.platform_order_ref,new.order_ref),'seller_order_ref',new.order_ref)
  );
  return new;
end $;

drop trigger if exists trg_ranova_notify_new_seller_order on public.ranova_seller_orders;
create trigger trg_ranova_notify_new_seller_order
after insert on public.ranova_seller_orders
for each row execute function private.ranova_notify_new_seller_order();

create or replace function private.ranova_notify_customer_order_change()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $
begin
  if new.status is distinct from old.status then
    perform private.ranova_queue_marketplace_notification(
      'buyer',null,new.customer_email,new.id,null,'order_status','RANOVA order update',
      'Order '||new.order_ref||' is now '||replace(new.status,'_',' ')||'.',
      jsonb_build_object('order_ref',new.order_ref,'status',new.status)
    );
  end if;
  if new.payment_status is distinct from old.payment_status then
    perform private.ranova_queue_marketplace_notification(
      'buyer',null,new.customer_email,new.id,null,'payment_status','RANOVA payment update',
      'Payment for order '||new.order_ref||' is now '||replace(new.payment_status,'_',' ')||'.',
      jsonb_build_object('order_ref',new.order_ref,'payment_status',new.payment_status)
    );
  end if;
  return new;
end $;

drop trigger if exists trg_ranova_notify_customer_order_change on public.ranova_customer_orders;
create trigger trg_ranova_notify_customer_order_change
after update of status,payment_status on public.ranova_customer_orders
for each row execute function private.ranova_notify_customer_order_change();

create or replace function private.ranova_notify_seller_payout_change()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $
declare v_email text;
begin
  if new.payout_status is distinct from old.payout_status then
    select email into v_email from auth.users where id=new.seller_id;
    perform private.ranova_queue_marketplace_notification(
      'seller',new.seller_id,v_email,null,new.seller_order_id,'payout_status','RANOVA payout update',
      'Payout for seller order '||new.seller_order_ref||' is now '||replace(new.payout_status,'_',' ')||'.',
      jsonb_build_object('seller_order_ref',new.seller_order_ref,'payout_status',new.payout_status,'payout_amount',new.payout_amount,'payout_reference',new.payout_reference)
    );
  end if;
  return new;
end $;

drop trigger if exists trg_ranova_notify_seller_payout_change on public.ranova_seller_payouts;
create trigger trg_ranova_notify_seller_payout_change
after update of payout_status on public.ranova_seller_payouts
for each row execute function private.ranova_notify_seller_payout_change();

create or replace function private.ranova_create_receipt_on_payment()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $
declare
  o public.ranova_customer_orders%rowtype;
  v_receipt_ref text;
  v_buyer_fee numeric(14,2);
  v_snapshot jsonb;
begin
  if new.payment_status='confirmed'
     and (tg_op='INSERT' or old.payment_status is distinct from new.payment_status) then
    select * into o from public.ranova_customer_orders where id=new.parent_order_id;
    if not found then return new; end if;
    v_receipt_ref:='RNV-RCT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    v_buyer_fee:=case when o.payment_fee_payer='buyer' then coalesce(o.payment_processing_fee,0) else 0 end;
    select jsonb_build_object(
      'order_ref',o.order_ref,'order_status',o.status,'payment_status',o.payment_status,
      'payment_method',o.payment_method,'payment_reference',new.payer_reference,
      'buyer_country_code',o.buyer_country_code,'buyer_country_name',o.buyer_country_name,
      'product_total',o.product_total,'delivery_fee',o.delivery_fee,'buyer_processing_fee',v_buyer_fee,
      'total_paid',coalesce(new.amount,o.total_payment),'finance_rule_ids',o.country_rule_ids,
      'finance_disclosure_version',o.finance_disclosure_version,
      'seller_orders',coalesce((
        select jsonb_agg(jsonb_build_object(
          'seller_order_ref',so.order_ref,'store_id',so.store_id,'subtotal',so.subtotal,
          'delivery_fee',so.delivery_fee,'total',so.total,'commission_rate',so.commission_rate_snapshot,
          'payment_processing_rate',so.payment_processing_rate_snapshot,'payment_fixed_fee',so.payment_fixed_fee_snapshot,
          'payment_fee_payer',so.payment_fee_payer_snapshot,'country_rule_id',so.country_rule_id
        ) order by so.created_at)
        from public.ranova_seller_orders so where so.parent_order_id=o.id
      ),'[]'::jsonb)
    ) into v_snapshot;

    insert into public.ranova_marketplace_receipts(
      receipt_ref,customer_order_id,order_ref,customer_name,customer_email,
      buyer_country_code,buyer_country_name,payment_method,payment_reference,
      product_total,delivery_fee,buyer_processing_fee,total_paid,currency,
      finance_disclosure_version,finance_rule_ids,issued_by,snapshot
    ) values (
      v_receipt_ref,o.id,o.order_ref,o.customer_name,o.customer_email,
      o.buyer_country_code,o.buyer_country_name,o.payment_method,new.payer_reference,
      o.product_total,o.delivery_fee,v_buyer_fee,coalesce(new.amount,o.total_payment),'GHS',
      o.finance_disclosure_version,o.country_rule_ids,new.confirmed_by,v_snapshot
    )
    on conflict (customer_order_id) do nothing;

    perform private.ranova_queue_marketplace_notification(
      'buyer',null,o.customer_email,o.id,null,'receipt_issued','RANOVA payment receipt ready',
      'Payment for order '||o.order_ref||' has been confirmed. Your RANOVA receipt is now available in order tracking.',
      jsonb_build_object('order_ref',o.order_ref,'receipt_ref',v_receipt_ref)
    );
  end if;
  return new;
end $;

drop trigger if exists trg_ranova_create_receipt_on_payment on public.ranova_marketplace_payments;
create trigger trg_ranova_create_receipt_on_payment
after insert or update of payment_status on public.ranova_marketplace_payments
for each row execute function private.ranova_create_receipt_on_payment();

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='ranova-notification-dispatch' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
end $;

select cron.schedule(
  'ranova-notification-dispatch',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url:='https://igaerssbzobutlwvjfwt.supabase.co/functions/v1/ranova-notify-dispatch',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr',
        'x-ranova-client','ranova-site-v1'
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=15000
    ) as request_id;
  $cron$
);
