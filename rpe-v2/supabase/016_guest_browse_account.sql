create table if not exists public.ranova_guest_browse_accounts (
  account_code text primary key,
  label text not null default 'Browse RANOVA',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.ranova_guest_browse_accounts(account_code,label,active)
values ('RNV-16032005','RANOVA Browse Account',true)
on conflict (account_code) do update
set label=excluded.label, active=true;
