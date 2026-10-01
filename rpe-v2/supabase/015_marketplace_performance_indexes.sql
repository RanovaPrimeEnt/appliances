-- Marketplace read-path indexes for customer app performance at scale.
create index if not exists idx_ranova_seller_stores_active_updated
on public.ranova_seller_stores (updated_at desc, id)
where store_status = 'active';

create index if not exists idx_ranova_seller_products_active_updated
on public.ranova_seller_products (updated_at desc, id)
where product_status = 'active';

create index if not exists idx_ranova_seller_products_active_store_updated
on public.ranova_seller_products (store_id, updated_at desc, id)
where product_status = 'active';
