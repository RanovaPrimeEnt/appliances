# RANOVA Native Customer — isolated Expo foundation

This is a **new native React Native/Expo client**, not a replacement for the existing hosted website, WebView Android/iOS apps, or Supabase Edge Functions.

## Local development

1. Install Node.js LTS.
2. In this directory run `npm install`.
3. Copy `.env.example` to `.env` and enter the **existing RANOVA** Supabase project URL and **publishable** key (never service_role or secret keys).
4. Run `npx expo start --clear`; open using Expo Go on a compatible device.
5. Verify that active products appear, or inspect the displayed RLS/database error.

## Scope and limitations

- First milestone is **read-only** product connectivity against `public.products` from migration 001.
- No payments, orders, checkout, seller functions, or production authentication have been migrated.
- Existing marketplace code remains the source of truth for current business rules.
- Do not publish or distribute this prototype as the finished RANOVA application.
- Before public release: review current database schema and RLS, test on devices, add native auth and checkout, and configure EAS signing.
- Expo dependency versions and device compatibility must be validated with `npx expo-doctor` and `npx expo install --check` after installation.
