# RANOVA mobile architecture

## Products
1. **RANOVA Marketplace**: one React Native/Expo application for both shoppers and sellers. Existing `mobile-expo/` is its starting point.
2. **RANOVA Admin**: separate React Native/Expo application, to be created after the customer/seller foundation is stable. It must have a distinct application identifier and restricted sign-in.

## Shared backend
Keep the existing Supabase project, but verify schema and row-level security (RLS) for each role. All sensitive operations (approvals, payouts, refunds, order transitions) must be checked server-side; UI role checks alone are not security.

## Marketplace roles
- Shopper: browse/search products, authenticate, manage cart, checkout, track orders, contact sellers.
- Seller: request seller access, create/manage storefront and products, handle inventory, orders and messages.
- A user may have both capabilities; use a role switcher after validating their seller status through the backend. Do not infer seller permissions from client state.

## Admin separation
- Separate `mobile-admin/` app, independent app ID, authentication flow and deployment.
- Restrict privileged database tables/functions with verified admin claims or server-side admin membership checks, appropriate RLS and audited functions.
- Do not put Supabase service-role credentials in either mobile app.
- Existing web admin remains operational during migration.

## Delivery milestones
1. Native customer catalogue and product detail.
2. Customer authentication and cart.
3. Seller onboarding, seller workspace, inventory and orders.
4. Secure checkout, payment verification, delivery and messaging.
5. Separate admin app and audited privileged operations.
6. Android device testing, QA, store-ready builds, iOS validation.

## Current state
Initial Expo scaffold and catalogue fetch code have been committed, but have **not** been built or tested on a device. Do not describe features as operational until verified.
