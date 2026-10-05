-- Optimize seller RLS policies so auth.uid() is evaluated once per statement.

drop policy if exists seller_accounts_select_own on public.ranova_seller_accounts;
create policy seller_accounts_select_own
on public.ranova_seller_accounts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists seller_verification_files_select_own on public.ranova_seller_verification_files;
create policy seller_verification_files_select_own
on public.ranova_seller_verification_files
for select
to authenticated
using ((select auth.uid()) = seller_id);

drop policy if exists seller_verification_files_insert_own on public.ranova_seller_verification_files;
create policy seller_verification_files_insert_own
on public.ranova_seller_verification_files
for insert
to authenticated
with check (
  (select auth.uid()) = seller_id
  and exists (
    select 1
    from public.ranova_seller_accounts a
    where a.user_id = (select auth.uid())
      and a.application_ref = ranova_seller_verification_files.application_ref
  )
);
