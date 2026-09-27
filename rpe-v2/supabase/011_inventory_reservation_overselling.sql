-- Step 16: Inventory reservation, order expiry and overselling protection.
-- Mirrors the live RANOVA reservation engine. Physical stock is deducted only
-- after RANOVA confirms payment; unpaid reservations expire automatically.

alter table public.ranova_customer_orders
  add column if not exists inventory_status text not null default 'not_required',
  add column if not exists inventory_reservation_expires_at timestamptz;

alter table public.ranova_marketplace_notifications
  add column if not exists notification_category text not null default 'transactional',
  add column if not exists action_url text,
  add column if not exists dedupe_key text;

create unique index if not exists ranova_marketplace_notifications_dedupe_uidx
  on public.ranova_marketplace_notifications(dedupe_key)
  where dedupe_key is not null;
create index if not exists ranova_marketplace_notifications_category_status_idx
  on public.ranova_marketplace_notifications(notification_category,email_status,created_at);

create table if not exists public.ranova_inventory_settings (
  id smallint primary key default 1 check (id=1),
  reservation_minutes integer not null default 120 check (reservation_minutes between 15 and 1440),
  expire_unpaid_orders boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.ranova_inventory_settings(id,reservation_minutes,expire_unpaid_orders)
values(1,120,true)
on conflict(id) do nothing;

create table if not exists public.ranova_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null,
  customer_order_id uuid references public.ranova_customer_orders(id) on delete cascade,
  seller_order_id uuid references public.ranova_seller_orders(id) on delete set null,
  product_id uuid not null references public.ranova_seller_products(id) on delete restrict,
  store_id uuid not null references public.ranova_seller_stores(id) on delete restrict,
  quantity integer not null check (quantity>0),
  status text not null check (status in ('held','committed','released','expired','restored')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz,
  committed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  updated_at timestamptz not null default now(),
  unique(order_ref,product_id)
);

create table if not exists public.ranova_inventory_events (
  id bigserial primary key,
  reservation_id uuid references public.ranova_inventory_reservations(id) on delete set null,
  product_id uuid not null references public.ranova_seller_products(id) on delete restrict,
  store_id uuid not null references public.ranova_seller_stores(id) on delete restrict,
  order_ref text,
  seller_order_id uuid references public.ranova_seller_orders(id) on delete set null,
  event_type text not null check (event_type in ('reserved','committed','released','expired','restored','stock_adjusted')),
  quantity integer not null check (quantity>0),
  stock_before integer,
  stock_after integer,
  note text,
  actor_type text not null default 'system' check (actor_type in ('system','buyer','seller','admin')),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ranova_inventory_res_order_idx
  on public.ranova_inventory_reservations(order_ref,status);
create index if not exists ranova_inventory_res_product_status_idx
  on public.ranova_inventory_reservations(product_id,status,expires_at);
create index if not exists ranova_inventory_res_seller_order_idx
  on public.ranova_inventory_reservations(seller_order_id);
create index if not exists ranova_inventory_reservations_store_idx
  on public.ranova_inventory_reservations(store_id);
create index if not exists ranova_inventory_res_customer_idx
  on public.ranova_inventory_reservations(customer_order_id);
create index if not exists ranova_inventory_events_order_idx
  on public.ranova_inventory_events(order_ref,created_at desc);
create index if not exists ranova_inventory_events_product_idx
  on public.ranova_inventory_events(product_id,created_at desc);
create index if not exists ranova_inventory_events_seller_order_idx
  on public.ranova_inventory_events(seller_order_id,created_at desc);
create index if not exists ranova_inventory_events_store_idx
  on public.ranova_inventory_events(store_id);
create index if not exists ranova_inventory_events_reservation_idx
  on public.ranova_inventory_events(reservation_id) where reservation_id is not null;
create index if not exists ranova_inventory_events_actor_idx
  on public.ranova_inventory_events(actor_user_id) where actor_user_id is not null;

alter table public.ranova_inventory_settings enable row level security;
alter table public.ranova_inventory_reservations enable row level security;
alter table public.ranova_inventory_events enable row level security;
revoke all on public.ranova_inventory_settings from anon, authenticated;
revoke all on public.ranova_inventory_reservations from anon, authenticated;
revoke all on public.ranova_inventory_events from anon, authenticated;

CREATE OR REPLACE FUNCTION public.ranova_commit_order_inventory(p_order_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_before integer;
  v_after integer;
  v_count integer:=0;
  v_total integer:=0;
  v_held integer:=0;
  v_expired integer:=0;
begin
  if coalesce(trim(p_order_ref),'')='' then
    raise exception 'Order reference is required.';
  end if;

  -- Lock every reservation for this order before deciding whether payment may commit.
  perform 1
  from public.ranova_inventory_reservations
  where order_ref=p_order_ref
  order by product_id
  for update;

  select count(*)::integer,
         count(*) filter (where status='held')::integer,
         count(*) filter (where status='expired' or (status='held' and expires_at<=now()))::integer
    into v_total,v_held,v_expired
  from public.ranova_inventory_reservations
  where order_ref=p_order_ref;

  if v_total=0 then
    update public.ranova_customer_orders
      set inventory_status='not_required',inventory_reservation_expires_at=null
    where order_ref=p_order_ref;
    return jsonb_build_object('ok',true,'committed_lines',0,'inventory_required',false);
  end if;

  if v_expired>0 then
    raise exception 'Inventory reservation expired. The buyer must place the order again so stock can be rechecked.';
  end if;

  -- If inventory exists for the order but nothing remains held or committed,
  -- the stock guarantee was released and payment must not revive it.
  if v_held=0 and not exists(
    select 1 from public.ranova_inventory_reservations
    where order_ref=p_order_ref and status='committed'
  ) then
    raise exception 'Inventory reservation is no longer active. The buyer must place the order again.';
  end if;

  for r in
    select ir.*
    from public.ranova_inventory_reservations ir
    where ir.order_ref=p_order_ref and ir.status='held'
    order by ir.product_id
    for update
  loop
    if r.expires_at is not null and r.expires_at<=now() then
      raise exception 'Inventory reservation expired. The buyer must place the order again so stock can be rechecked.';
    end if;

    select stock_quantity into v_before
    from public.ranova_seller_products
    where id=r.product_id
    for update;

    if not found then
      raise exception 'A reserved product no longer exists.';
    end if;

    if v_before is null then
      update public.ranova_inventory_reservations
        set status='committed',committed_at=now(),updated_at=now()
      where id=r.id;
      insert into public.ranova_inventory_events(
        reservation_id,product_id,store_id,order_ref,seller_order_id,event_type,
        quantity,stock_before,stock_after,note,actor_type
      ) values(
        r.id,r.product_id,r.store_id,r.order_ref,r.seller_order_id,'committed',
        r.quantity,null,null,'Reservation committed after RANOVA payment confirmation. Quantity-managed stock was not enabled for this product.','system'
      );
      v_count:=v_count+1;
      continue;
    end if;

    if v_before<r.quantity then
      raise exception 'Inventory changed and can no longer cover this reservation.';
    end if;

    v_after:=v_before-r.quantity;
    update public.ranova_seller_products
      set stock_quantity=v_after,
          stock_status=case
            when v_after=0 then 'out_of_stock'
            when stock_status='out_of_stock' and v_after>0 then 'in_stock'
            else stock_status
          end,
          updated_at=now()
    where id=r.product_id;

    update public.ranova_inventory_reservations
      set status='committed',committed_at=now(),updated_at=now()
    where id=r.id;

    insert into public.ranova_inventory_events(
      reservation_id,product_id,store_id,order_ref,seller_order_id,event_type,
      quantity,stock_before,stock_after,note,actor_type
    ) values(
      r.id,r.product_id,r.store_id,r.order_ref,r.seller_order_id,'committed',
      r.quantity,v_before,v_after,'Reservation committed after RANOVA payment confirmation.','system'
    );
    v_count:=v_count+1;
  end loop;

  update public.ranova_customer_orders
    set inventory_status='committed',inventory_reservation_expires_at=null
  where order_ref=p_order_ref;

  return jsonb_build_object('ok',true,'committed_lines',v_count,'inventory_required',true);
end $function$;

CREATE OR REPLACE FUNCTION public.ranova_expire_inventory_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; v_count integer:=0;
begin
  for r in
    select * from public.ranova_inventory_reservations
    where status='held' and expires_at<=now()
    order by product_id
    for update
  loop
    update public.ranova_inventory_reservations
      set status='expired',released_at=now(),release_reason='Reservation expired before payment confirmation.',updated_at=now()
    where id=r.id;
    insert into public.ranova_inventory_events(reservation_id,product_id,store_id,order_ref,seller_order_id,event_type,quantity,stock_before,stock_after,note)
      select r.id,r.product_id,r.store_id,r.order_ref,r.seller_order_id,'expired',r.quantity,p.stock_quantity,p.stock_quantity,'Temporary inventory hold expired.'
      from public.ranova_seller_products p where p.id=r.product_id;
    v_count:=v_count+1;
  end loop;

  update public.ranova_customer_orders co
    set status='expired',inventory_status='expired',inventory_reservation_expires_at=null
  where co.inventory_status='held'
    and co.inventory_reservation_expires_at<=now()
    and co.payment_status not in ('paid','refunded','partially_refunded')
    and co.status in ('awaiting_confirmation','awaiting_payment','pending');

  update public.ranova_seller_orders so
    set order_status='cancelled',updated_at=now()
  from public.ranova_customer_orders co
  where so.parent_order_id=co.id and co.status='expired'
    and so.payment_status<>'paid'
    and so.order_status in ('new','confirmed','preparing','ready_for_dispatch');

  insert into public.ranova_marketplace_notifications(
    recipient_type,recipient_user_id,recipient_email,customer_order_id,
    notification_type,notification_category,title,message,metadata,
    in_app_visible,email_requested,email_status,action_url,dedupe_key
  )
  select
    'buyer',co.buyer_user_id,co.customer_email,co.id,
    'inventory_reservation_expired','transactional',
    'RANOVA stock reservation expired',
    'The temporary stock reservation for order '||co.order_ref||' expired before payment confirmation. Review current stock and place the order again if you still want the items.',
    jsonb_build_object('order_ref',co.order_ref),
    true,
    case when co.customer_email is not null and coalesce(bp.email_order_updates,true) then true else false end,
    case when co.customer_email is not null and coalesce(bp.email_order_updates,true) then 'queued' else 'not_requested' end,
    '/appliances/all/order-status.html?ref='||co.order_ref,
    'reservation-expired-buyer:'||co.id::text
  from public.ranova_customer_orders co
  left join public.ranova_buyer_preferences bp on bp.user_id=co.buyer_user_id
  where co.status='expired' and co.inventory_status='expired'
    and co.created_at>=now()-interval '2 days'
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  insert into public.ranova_marketplace_notifications(
    recipient_type,recipient_user_id,recipient_email,customer_order_id,seller_order_id,
    notification_type,notification_category,title,message,metadata,
    in_app_visible,email_requested,email_status,action_url,dedupe_key
  )
  select
    'seller',so.seller_id,au.email,so.parent_order_id,so.id,
    'inventory_reservation_expired','transactional',
    'A RANOVA stock reservation expired',
    'Seller order '||so.order_ref||' was cancelled because the buyer stock reservation expired before payment confirmation.',
    jsonb_build_object('platform_order_ref',so.platform_order_ref,'seller_order_ref',so.order_ref),
    true,(au.email is not null),case when au.email is not null then 'queued' else 'not_requested' end,
    '/appliances/all/seller-dashboard.html',
    'reservation-expired-seller:'||so.id::text
  from public.ranova_seller_orders so
  left join auth.users au on au.id=so.seller_id
  join public.ranova_customer_orders co on co.id=so.parent_order_id
  where co.status='expired' and co.inventory_status='expired'
    and so.order_status='cancelled' and co.created_at>=now()-interval '2 days'
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.ranova_release_order_inventory(p_order_ref text, p_seller_order_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Order cancelled'::text, p_restore_committed boolean DEFAULT false, p_actor_type text DEFAULT 'system'::text, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; v_before integer; v_after integer; v_count integer:=0; v_open boolean; v_committed boolean;
begin
  for r in select ir.* from public.ranova_inventory_reservations ir
    where ir.order_ref=p_order_ref and (p_seller_order_id is null or ir.seller_order_id=p_seller_order_id)
      and (ir.status='held' or (p_restore_committed and ir.status='committed'))
    order by ir.product_id for update
  loop
    if r.status='held' then
      update public.ranova_inventory_reservations set status='released',released_at=now(),release_reason=left(coalesce(p_reason,'Order cancelled'),500),updated_at=now() where id=r.id;
      select stock_quantity into v_before from public.ranova_seller_products where id=r.product_id;
      insert into public.ranova_inventory_events(reservation_id,product_id,store_id,order_ref,seller_order_id,event_type,quantity,stock_before,stock_after,note,actor_type,actor_user_id)
      values(r.id,r.product_id,r.store_id,r.order_ref,r.seller_order_id,'released',r.quantity,v_before,v_before,left(coalesce(p_reason,'Order cancelled'),500),p_actor_type,p_actor_user_id);
    else
      select stock_quantity into v_before from public.ranova_seller_products where id=r.product_id for update;
      if v_before is not null then v_after:=v_before+r.quantity;
        update public.ranova_seller_products set stock_quantity=v_after,stock_status=case when stock_status='out_of_stock' then 'in_stock' else stock_status end,updated_at=now() where id=r.product_id;
      else v_after:=null; end if;
      update public.ranova_inventory_reservations set status='restored',released_at=now(),release_reason=left(coalesce(p_reason,'Returned stock restored'),500),updated_at=now() where id=r.id;
      insert into public.ranova_inventory_events(reservation_id,product_id,store_id,order_ref,seller_order_id,event_type,quantity,stock_before,stock_after,note,actor_type,actor_user_id)
      values(r.id,r.product_id,r.store_id,r.order_ref,r.seller_order_id,'restored',r.quantity,v_before,v_after,left(coalesce(p_reason,'Returned stock restored'),500),p_actor_type,p_actor_user_id);
    end if; v_count:=v_count+1;
  end loop;
  select exists(select 1 from public.ranova_inventory_reservations where order_ref=p_order_ref and status='held' and expires_at>now()) into v_open;
  select exists(select 1 from public.ranova_inventory_reservations where order_ref=p_order_ref and status='committed') into v_committed;
  update public.ranova_customer_orders set
    inventory_status=case when v_open then 'held' when v_committed then 'committed' else 'released' end,
    inventory_reservation_expires_at=case when v_open then inventory_reservation_expires_at else null end
  where order_ref=p_order_ref;
  return jsonb_build_object('ok',true,'affected_lines',v_count);
end $function$;

CREATE OR REPLACE FUNCTION public.ranova_reserve_order_inventory(p_order_ref text, p_items jsonb, p_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_minutes integer; v_expires timestamptz; v_item jsonb; v_product uuid; v_qty integer;
  v_stock integer; v_reserved integer; v_store uuid; v_res_id uuid; v_name text; v_count integer:=0;
begin
  if coalesce(trim(p_order_ref),'')='' then raise exception 'Order reference is required.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Inventory items are required.'; end if;
  select reservation_minutes into v_minutes from public.ranova_inventory_settings where id=1;
  v_minutes:=greatest(15,least(1440,coalesce(p_minutes,v_minutes,120)));
  v_expires:=now()+make_interval(mins=>v_minutes);

  for v_item in select value from jsonb_array_elements(p_items) order by (value->>'product_id')::uuid
  loop
    v_product:=(v_item->>'product_id')::uuid; v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
    select stock_quantity,store_id,name into v_stock,v_store,v_name
    from public.ranova_seller_products where id=v_product and product_status='active' for update;
    if not found then raise exception 'One of the selected products is not available.'; end if;
    if v_stock is null then continue; end if;
    select coalesce(sum(quantity),0)::integer into v_reserved from public.ranova_inventory_reservations
    where product_id=v_product and status='held' and expires_at>now();
    if v_qty > greatest(0,v_stock-v_reserved) then
      raise exception '% does not have enough available stock. Available now: %.',coalesce(v_name,'Product'),greatest(0,v_stock-v_reserved);
    end if;
    insert into public.ranova_inventory_reservations(order_ref,product_id,store_id,quantity,status,expires_at)
    values(p_order_ref,v_product,v_store,v_qty,'held',v_expires)
    on conflict(order_ref,product_id) do update set quantity=excluded.quantity,status='held',expires_at=excluded.expires_at,released_at=null,release_reason=null,updated_at=now()
    returning id into v_res_id;
    insert into public.ranova_inventory_events(reservation_id,product_id,store_id,order_ref,event_type,quantity,stock_before,stock_after,note)
    values(v_res_id,v_product,v_store,p_order_ref,'reserved',v_qty,v_stock,v_stock,'Temporary stock hold created. Physical stock is deducted only when payment is confirmed.');
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('ok',true,'reserved_lines',v_count,'expires_at',case when v_count>0 then v_expires else null end,'reservation_minutes',v_minutes);
end $function$;

revoke all on function public.ranova_reserve_order_inventory(text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.ranova_commit_order_inventory(text) from public,anon,authenticated;
revoke all on function public.ranova_release_order_inventory(text,uuid,text,boolean,text,uuid) from public,anon,authenticated;
revoke all on function public.ranova_expire_inventory_reservations() from public,anon,authenticated;
grant execute on function public.ranova_reserve_order_inventory(text,jsonb,integer) to service_role;
grant execute on function public.ranova_commit_order_inventory(text) to service_role;
grant execute on function public.ranova_release_order_inventory(text,uuid,text,boolean,text,uuid) to service_role;
grant execute on function public.ranova_expire_inventory_reservations() to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='ranova-inventory-reservation-expiry' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'ranova-inventory-reservation-expiry',
  '*/5 * * * *',
  $cron$select public.ranova_expire_inventory_reservations();$cron$
);
