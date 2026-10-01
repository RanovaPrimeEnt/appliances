-- Permanent unique buyer codes for RANOVA customer accounts.
-- Existing customers are backfilled once; new profiles receive a code automatically.

create sequence if not exists public.ranova_buyer_code_seq start with 100001;

alter table public.profiles
  add column if not exists buyer_code text;

alter table public.profiles
  alter column buyer_code set default ('RNV-BYR-' || lpad(nextval('public.ranova_buyer_code_seq')::text, 8, '0'));

update public.profiles
set buyer_code = 'RNV-BYR-' || lpad(nextval('public.ranova_buyer_code_seq')::text, 8, '0')
where buyer_code is null or btrim(buyer_code) = '';

create unique index if not exists profiles_buyer_code_key
  on public.profiles (buyer_code);

alter table public.profiles
  alter column buyer_code set not null;

alter sequence public.ranova_buyer_code_seq
  owned by public.profiles.buyer_code;
