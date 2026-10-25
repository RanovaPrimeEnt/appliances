# RANOVA native customer app — first milestone

This is a **new React Native/Expo frontend**, not a WebView. It is an initial UI scaffold, **not a working marketplace or store-ready release**.

## Run

1. Install Node.js LTS and Git.
2. From the repository root: `cd mobile-expo`.
3. Run `npm install`.
4. Run `npx expo start` and scan the QR code using Expo Go, or launch an emulator. If dependency validation reports version mismatches, run `npx expo install --fix`.

## Current scope
- Native home, search filtering over placeholder categories, and account placeholder.
- No HTML/WebView.
- No production login, product loading, checkout, payments, messaging, or seller features yet.
- Existing website, Android and iOS projects are untouched.

## Next milestone
Inspect the existing Supabase schema and RLS policies, then implement product queries, authentication, cart and order flows. Never embed a service-role key in the mobile app. Test all authorization and payment flows before release.

Note: `com.ranova.marketplace` is also used by the existing native wrapper projects. Do not submit both implementations as separate apps with the same store identity without planning a migration.
