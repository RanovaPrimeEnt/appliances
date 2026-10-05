-- RANOVA production-release hardening
-- Mirrors the security/performance changes applied to the hosted Supabase project on 2026-10-05.

begin;

alter table public.ranova_guest_browse_accounts enable row level security;
grant select on public.ranova_guest_browse_accounts to anon, authenticated;

drop policy if exists "guest browse active read" on public.ranova_guest_browse_accounts;
create policy "guest browse active read"
on public.ranova_guest_browse_accounts
for select
to anon, authenticated
using (active = true);

do $$
declare
  t text;
  targets text[] := array[
    'ranova_admin_seller_messages','ranova_admin_seller_threads',
    'ranova_after_sales_cases','ranova_after_sales_events',
    'ranova_business_documents','ranova_catalogue_imports',
    'ranova_customer_orders','ranova_delivery_events','ranova_delivery_proofs','ranova_delivery_zones',
    'ranova_finance_daily_snapshots','ranova_finance_reconciliation_issues','ranova_finance_reconciliation_runs',
    'ranova_inventory_events','ranova_inventory_reservations','ranova_inventory_settings',
    'ranova_marketplace_country_rules','ranova_marketplace_discovery_events',
    'ranova_marketplace_dispute_messages','ranova_marketplace_disputes',
    'ranova_marketplace_finance_settings','ranova_marketplace_notifications',
    'ranova_marketplace_payment_accounts','ranova_marketplace_payments','ranova_marketplace_receipts',
    'ranova_marketplace_refunds','ranova_marketplace_reviews','ranova_marketplace_sponsored_placements',
    'ranova_order_deliveries','ranova_payment_provider_events','ranova_report_evidence',
    'ranova_review_moderation_events','ranova_risk_flags','ranova_risk_review_events','ranova_safety_reports',
    'ranova_seller_appeals','ranova_seller_applications','ranova_seller_enforcement',
    'ranova_seller_enforcement_events','ranova_seller_finance_profiles','ranova_seller_payouts',
    'ranova_seller_performance','ranova_seller_trust_metrics','ranova_settlement_ledger','ranova_store_cases'
  ];
begin
  foreach t in array targets loop
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename=t and policyname='RANOVA admin full access'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_rpe_admin()) with check (public.is_rpe_admin())',
        'RANOVA admin full access', t
      );
    end if;
  end loop;
end $$;

-- Add covering indexes for every public-schema foreign key that does not already
-- have a compatible leading index. This protects order, finance, messaging and
-- seller workflows from avoidable sequential scans as the marketplace grows.
do $$
declare
  r record;
  idx_name text;
  col_list text;
begin
  for r in
    select
      con.oid,
      c.relname table_name,
      con.conname constraint_name,
      con.conrelid,
      con.conkey,
      array_agg(a.attname order by u.ord) cols
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    join unnest(con.conkey) with ordinality u(attnum,ord) on true
    join pg_attribute a on a.attrelid=c.oid and a.attnum=u.attnum
    where con.contype='f' and n.nspname='public'
    group by con.oid,c.relname,con.conname,con.conrelid,con.conkey
    having not exists (
      select 1 from pg_index i
      where i.indrelid=con.conrelid
        and (i.indkey::smallint[])[0:cardinality(con.conkey)-1] = con.conkey
    )
  loop
    idx_name := left('idx_fk_'||r.table_name||'_'||r.cols[1],54)||'_'||substr(md5(r.constraint_name),1,6);
    select string_agg(format('%I',x),', ') into col_list from unnest(r.cols) x;
    execute format('create index if not exists %I on public.%I (%s)',idx_name,r.table_name,col_list);
  end loop;
end $$;

drop index if exists public.ranova_inventory_res_order_idx;
drop index if exists public.ranova_inventory_res_product_status_idx;

commit;
