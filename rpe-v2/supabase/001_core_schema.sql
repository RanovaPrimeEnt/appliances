-- Ranova Prime Enterprise - realtime commerce foundation
-- Prepared for Supabase/Postgres. Apply only to the dedicated RPE project.

create extension if not exists pgcrypto;

create sequence if not exists public.rpe_order_number_seq start 1;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  preferred_contact text check (preferred_contact in ('whatsapp','email','phone')) default 'whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','orders','catalogue')) default 'manager',
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  image_url text,
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  sku text unique,
  name text not null,
  slug text not null unique,
  brand text,
  category_id uuid references public.categories(id) on delete set null,
  short_description text,
  description text,
  price numeric(12,2),
  currency text not null default 'GHS',
  stock_quantity int,
  stock_status text not null default 'confirm_on_enquiry'
    check (stock_status in ('in_stock','low_stock','out_of_stock','preorder','confirm_on_enquiry')),
  warranty text,
  dimensions text,
  specifications jsonb not null default '{}'::jsonb,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  region text,
  city text,
  area text,
  street_address text,
  landmark text,
  delivery_instructions text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.recently_viewed (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity int not null check (quantity between 1 and 99) default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  address_id uuid references public.addresses(id) on delete set null,
  order_type text not null default 'enquiry'
    check (order_type in ('enquiry','purchase')),
  order_status text not null default 'quote_pending'
    check (order_status in (
      'quote_pending','awaiting_confirmation','awaiting_payment','payment_confirmed',
      'preparing','ready_for_dispatch','dispatched','out_for_delivery','delivered',
      'cancelled','return_requested','returned','refund_pending','refunded'
    )),
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required','unpaid','pending','paid','failed','refunded','partially_refunded')),
  subtotal numeric(12,2),
  discount numeric(12,2) not null default 0,
  delivery_fee numeric(12,2),
  total numeric(12,2),
  currency text not null default 'GHS',
  customer_note text,
  admin_note text,
  quoted_at timestamptz,
  paid_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2),
  line_total numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  message text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  related_order_id uuid references public.orders(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  photo_urls text[] not null default '{}',
  return_status text not null default 'submitted'
    check (return_status in ('submitted','under_review','approved','rejected','awaiting_item','item_received','refund_processing','completed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  title text,
  review text,
  photo_urls text[] not null default '{}',
  verified_purchase boolean not null default true,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (user_id, product_id)
);

create table if not exists public.admin_activity (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_addresses_user on public.addresses(user_id);
create index if not exists idx_favorites_user on public.favorites(user_id);
create index if not exists idx_recent_user on public.recently_viewed(user_id, viewed_at desc);
create index if not exists idx_orders_user_created on public.orders(user_id, created_at desc);
create index if not exists idx_orders_status on public.orders(order_status);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_events_order on public.order_events(order_id, created_at);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
create index if not exists idx_returns_user on public.return_requests(user_id, created_at desc);

create or replace function public.is_rpe_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_rpe_admin() from public;
grant execute on function public.is_rpe_admin() to authenticated;

create or replace function public.handle_new_rpe_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name','')
  )
  on conflict (user_id) do nothing;

  insert into public.carts(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_rpe on auth.users;
create trigger on_auth_user_created_rpe
after insert on auth.users
for each row execute function public.handle_new_rpe_user();

create or replace function public.rpe_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.rpe_touch_updated_at();
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.rpe_touch_updated_at();
drop trigger if exists addresses_touch on public.addresses;
create trigger addresses_touch before update on public.addresses for each row execute function public.rpe_touch_updated_at();
drop trigger if exists cart_items_touch on public.cart_items;
create trigger cart_items_touch before update on public.cart_items for each row execute function public.rpe_touch_updated_at();
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.rpe_touch_updated_at();
drop trigger if exists returns_touch on public.return_requests;
create trigger returns_touch before update on public.return_requests for each row execute function public.rpe_touch_updated_at();

create or replace function public.create_rpe_order_from_cart(p_address_id uuid default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_cart uuid;
  v_order uuid := gen_random_uuid();
  v_number text;
  v_count int;
begin
  if v_user is null then raise exception 'Sign in required'; end if;

  select id into v_cart from public.carts where user_id = v_user;
  select count(*) into v_count from public.cart_items where cart_id = v_cart;
  if coalesce(v_count,0) = 0 then raise exception 'Your cart is empty'; end if;

  if p_address_id is not null and not exists(
    select 1 from public.addresses where id = p_address_id and user_id = v_user
  ) then raise exception 'Invalid address'; end if;

  v_number := 'RPE-' || to_char(now(),'YYYY') || '-' ||
              lpad(nextval('public.rpe_order_number_seq')::text, 5, '0');

  insert into public.orders(id, order_number, user_id, address_id, order_type, order_status, payment_status, customer_note)
  values(v_order, v_number, v_user, p_address_id, 'enquiry', 'quote_pending', 'not_required', nullif(trim(p_note),''));

  insert into public.order_items(order_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price, line_total)
  select v_order, p.id, p.name, p.sku, ci.quantity, p.price,
         case when p.price is null then null else p.price * ci.quantity end
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart and p.active = true;

  insert into public.order_events(order_id, status, message, created_by)
  values(v_order, 'quote_pending', 'Order request received. RPE will confirm price and availability.', v_user);

  insert into public.notifications(user_id, type, title, message, related_order_id)
  values(v_user, 'order', 'Order request received', 'Your RPE order request ' || v_number || ' has been received.', v_order);

  delete from public.cart_items where cart_id = v_cart;
  return v_order;
end;
$$;

revoke all on function public.create_rpe_order_from_cart(uuid,text) from public;
grant execute on function public.create_rpe_order_from_cart(uuid,text) to authenticated;

create or replace function public.rpe_order_status_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text;
begin
  if old.order_status is distinct from new.order_status then
    v_message := case new.order_status
      when 'awaiting_payment' then 'Your order is ready for payment.'
      when 'payment_confirmed' then 'Payment has been confirmed.'
      when 'preparing' then 'RPE is preparing your order.'
      when 'ready_for_dispatch' then 'Your order is ready for dispatch.'
      when 'dispatched' then 'Your order has been dispatched.'
      when 'out_for_delivery' then 'Your order is on the way.'
      when 'delivered' then 'Your order has been delivered.'
      when 'cancelled' then 'Your order has been cancelled.'
      when 'return_requested' then 'Your return request has been received.'
      when 'refund_pending' then 'Your refund is being processed.'
      when 'refunded' then 'Your refund has been completed.'
      else 'Your order status has been updated.'
    end;

    insert into public.order_events(order_id,status,message,created_by)
    values(new.id,new.order_status,v_message,(select auth.uid()));

    insert into public.notifications(user_id,type,title,message,related_order_id)
    values(new.user_id,'order_status','Order ' || new.order_number,v_message,new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_notify on public.orders;
create trigger orders_status_notify
after update of order_status on public.orders
for each row execute function public.rpe_order_status_notification();

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.addresses enable row level security;
alter table public.favorites enable row level security;
alter table public.recently_viewed enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.notifications enable row level security;
alter table public.return_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.stock_alerts enable row level security;
alter table public.admin_activity enable row level security;

create policy "public active categories" on public.categories for select to anon, authenticated using (active = true);
create policy "public active products" on public.products for select to anon, authenticated using (active = true);
create policy "public product images" on public.product_images for select to anon, authenticated using (true);
create policy "public approved reviews" on public.reviews for select to anon, authenticated using (status = 'approved');

create policy "own profile select" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own addresses" on public.addresses for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own favorites" on public.favorites for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own recent" on public.recently_viewed for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own cart" on public.carts for select to authenticated using ((select auth.uid()) = user_id);
create policy "own cart items select" on public.cart_items for select to authenticated using (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy "own cart items insert" on public.cart_items for insert to authenticated with check (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy "own cart items update" on public.cart_items for update to authenticated using (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))) with check (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy "own cart items delete" on public.cart_items for delete to authenticated using (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));

create policy "own orders select" on public.orders for select to authenticated using ((select auth.uid()) = user_id);
create policy "own order items select" on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy "own order events select" on public.order_events for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy "own notifications select" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "own notifications update" on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own returns select" on public.return_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "own returns insert" on public.return_requests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own review insert" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id and exists(
  select 1 from public.order_items oi join public.orders o on o.id=oi.order_id
  where oi.id=order_item_id and oi.product_id=reviews.product_id and o.user_id=(select auth.uid()) and o.order_status='delivered'
));
create policy "own stock alerts" on public.stock_alerts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "admins select admin users" on public.admin_users for select to authenticated using (public.is_rpe_admin());
create policy "admins categories" on public.categories for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins products" on public.products for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins product images" on public.product_images for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins orders" on public.orders for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins order items" on public.order_items for select to authenticated using (public.is_rpe_admin());
create policy "admins order events" on public.order_events for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins notifications" on public.notifications for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins returns" on public.return_requests for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins reviews" on public.reviews for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin());
create policy "admins activity" on public.admin_activity for select to authenticated using (public.is_rpe_admin());

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.product_images, public.reviews to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses, public.favorites, public.recently_viewed, public.cart_items, public.stock_alerts to authenticated;
grant select on public.carts, public.orders, public.order_items, public.order_events to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert on public.return_requests to authenticated;
grant insert on public.reviews to authenticated;
grant usage, select on sequence public.rpe_order_number_seq to authenticated;

-- Realtime publication. These are the customer-facing tables that should update live.
do $$
begin
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.return_requests; exception when duplicate_object then null; end;
end $$;
