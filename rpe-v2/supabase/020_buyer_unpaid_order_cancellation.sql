-- Buyer-initiated cancellation of an unpaid marketplace order.
-- Deploy this migration BEFORE deploying the matching ranova-order-status edge function.
-- This server-only RPC runs atomically: payment eligibility, child orders, inventory
-- release, and audit recording succeed together or all roll back.
create table if not exists public.ranova_buyer_order_cancellations (
  id uuid primary key default gen_random_uuid(),
  customer_order_id uuid not null unique references public.ranova_customer_orders(id) on delete cascade,
  order_ref text not null,
  buyer_user_id uuid not null references auth.users(id),
  reason text not null check (reason in ('address_issue','shipping_issue','changed_mind','price_concern','other')),
  created_at timestamptz not null default now()
);
alter table public.ranova_buyer_order_cancellations enable row level security;
revoke all on public.ranova_buyer_order_cancellations from anon,authenticated;
grant select,insert on public.ranova_buyer_order_cancellations to service_role;

create or replace function public.ranova_buyer_cancel_unpaid_order(
  p_order_ref text, p_buyer_user_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.ranova_customer_orders%rowtype;
  v_child public.ranova_seller_orders%rowtype;
  v_payment public.ranova_marketplace_payments%rowtype;
begin
  if p_order_ref is null or p_buyer_user_id is null or
     p_reason not in ('address_issue','shipping_issue','changed_mind','price_concern','other') then
    return jsonb_build_object('ok',false,'error','Valid order, account, and cancellation reason are required.');
  end if;

  select * into v_order from public.ranova_customer_orders
    where order_ref=p_order_ref and buyer_user_id=p_buyer_user_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','This order is not linked to your signed-in account. Contact RANOVA support.');
  end if;
  if v_order.status='cancelled' then
    return jsonb_build_object('ok',true,'status','cancelled','already_cancelled',true);
  end if;
  if v_order.status not in ('awaiting_confirmation','awaiting_payment','pending') or
     coalesce(v_order.payment_status,'not_started') not in ('not_started','unpaid','failed') then
    return jsonb_build_object('ok',false,'error','This order has advanced beyond safe self-cancellation. Contact RANOVA support.');
  end if;

  -- A payment record can mean that a provider collection is already in flight.
  -- Do not cancel even a pending payment record without reconciliation.
  select * into v_payment from public.ranova_marketplace_payments
    where parent_order_id=v_order.id for update;
  if found then
    return jsonb_build_object('ok',false,'error','Payment processing has started for this order. Contact RANOVA support to avoid a payment conflict.');
  end if;

  -- Lock and validate all seller child orders before mutating any one of them.
  for v_child in select * from public.ranova_seller_orders
      where parent_order_id=v_order.id order by id for update
  loop
    if v_child.order_status not in ('new','confirmed') or
       v_child.payment_status not in ('not_started','failed') then
      return jsonb_build_object('ok',false,'error','A seller has started processing this order. Contact RANOVA support.');
    end if;
  end loop;

  update public.ranova_customer_orders
    set status='cancelled'
    where id=v_order.id;
  update public.ranova_seller_orders
    set order_status='cancelled',updated_at=now()
    where parent_order_id=v_order.id;

  perform public.ranova_release_order_inventory(
    v_order.order_ref,null,'Buyer cancellation: '||p_reason,false,'buyer',p_buyer_user_id
  );
  insert into public.ranova_buyer_order_cancellations(customer_order_id,order_ref,buyer_user_id,reason)
    values(v_order.id,v_order.order_ref,p_buyer_user_id,p_reason)
    on conflict (customer_order_id) do nothing;

  return jsonb_build_object('ok',true,'status','cancelled');
end;
$$;
revoke all on function public.ranova_buyer_cancel_unpaid_order(text,uuid,text) from public,anon,authenticated;
grant execute on function public.ranova_buyer_cancel_unpaid_order(text,uuid,text) to service_role;
