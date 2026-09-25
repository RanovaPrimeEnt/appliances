-- RPE hardening pass
alter function public.rpe_touch_updated_at() set search_path = public, pg_temp;

revoke all on function public.handle_new_rpe_user() from public, anon, authenticated;
revoke all on function public.rpe_order_status_notification() from public, anon, authenticated;
revoke all on function public.rpe_touch_updated_at() from public, anon, authenticated;

revoke all on function public.create_rpe_order_from_cart(uuid,text) from public, anon;
grant execute on function public.create_rpe_order_from_cart(uuid,text) to authenticated;

revoke all on function public.is_rpe_admin() from public, anon;
grant execute on function public.is_rpe_admin() to authenticated;

create index if not exists idx_admin_activity_admin_user on public.admin_activity(admin_user_id);
create index if not exists idx_cart_items_product on public.cart_items(product_id);
create index if not exists idx_favorites_product on public.favorites(product_id);
create index if not exists idx_notifications_related_order on public.notifications(related_order_id);
create index if not exists idx_order_events_created_by on public.order_events(created_by);
create index if not exists idx_order_items_product on public.order_items(product_id);
create index if not exists idx_orders_address on public.orders(address_id);
create index if not exists idx_product_images_product on public.product_images(product_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_recently_viewed_product on public.recently_viewed(product_id);
create index if not exists idx_return_requests_order on public.return_requests(order_id);
create index if not exists idx_return_requests_order_item on public.return_requests(order_item_id);
create index if not exists idx_reviews_product on public.reviews(product_id);
create index if not exists idx_reviews_user on public.reviews(user_id);
create index if not exists idx_stock_alerts_product on public.stock_alerts(product_id);
