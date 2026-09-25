-- RPE admin operational access. RLS still determines who can use these privileges.

grant select on public.profiles, public.addresses to authenticated;
grant insert, update, delete on public.categories, public.products, public.product_images to authenticated;
grant update on public.orders to authenticated;
grant insert on public.order_events, public.notifications, public.admin_activity to authenticated;
grant update on public.return_requests, public.reviews to authenticated;

drop policy if exists "admins profiles read" on public.profiles;
create policy "admins profiles read" on public.profiles
for select to authenticated using (public.is_rpe_admin());

drop policy if exists "admins addresses read" on public.addresses;
create policy "admins addresses read" on public.addresses
for select to authenticated using (public.is_rpe_admin());

drop policy if exists "admins activity insert" on public.admin_activity;
create policy "admins activity insert" on public.admin_activity
for insert to authenticated with check (
  public.is_rpe_admin() and admin_user_id = (select auth.uid())
);
