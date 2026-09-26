-- RANOVA finance fairness/versioning controls
-- Applied to Supabase on 2026-09-26.

alter table public.ranova_marketplace_country_rules
  add column if not exists rule_version integer not null default 1,
  add column if not exists supersedes_rule_id uuid references public.ranova_marketplace_country_rules(id) on delete set null,
  add column if not exists effective_to timestamptz,
  add column if not exists change_reason text,
  add column if not exists source_verified_at timestamptz;

drop index if exists public.uq_ranova_country_rule_scope;

create unique index if not exists uq_ranova_country_rule_active_scope
on public.ranova_marketplace_country_rules(
  coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(seller_country_code,'*'),
  coalesce(buyer_country_code,'*'),
  coalesce(payment_method,'*')
)
where active=true and effective_to is null;

create index if not exists idx_ranova_country_rules_history
  on public.ranova_marketplace_country_rules(
    coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(seller_country_code,'*'),
    coalesce(buyer_country_code,'*'),
    coalesce(payment_method,'*'),
    rule_version desc
  );

alter table public.ranova_customer_orders
  add column if not exists finance_disclosure_version integer not null default 1;

alter table public.ranova_seller_orders
  add column if not exists finance_disclosure_version integer not null default 1;

alter table public.ranova_seller_payouts
  add column if not exists payment_processing_rate numeric(5,2) not null default 0,
  add column if not exists payment_processing_fee numeric(14,2) not null default 0,
  add column if not exists payment_fee_payer text not null default 'platform';

comment on column public.ranova_marketplace_country_rules.rule_version is
'Immutable version number for one country/store/payment rule scope. Active changes create a new version rather than rewriting history.';
comment on column public.ranova_marketplace_country_rules.change_reason is
'Plain-language reason explaining why a finance rule changed.';
comment on column public.ranova_marketplace_country_rules.effective_to is
'When this historical rule version stopped applying to new orders.';
