# RANOVA Hubtel Ghana Integration Checklist

Status: PRE-LIVE. The marketplace ledger, customer payment entry point and seller payout controls are prepared. No browser code contains provider secrets.

## Secrets to add later in Supabase Edge Function secrets
- HUBTEL_CLIENT_ID
- HUBTEL_CLIENT_SECRET
- HUBTEL_MERCHANT_ID

Only add values issued directly for the approved RANOVA business integration. Do not paste these into GitHub Pages, app.js, admin.js, seller HTML, config.js or any public repository file.

## Already prepared
- Customer app calls the server-side `ranova-payment-gateway`.
- Pre-live initialize/status/verify actions are available.
- Manual collection account fallback remains auditable.
- Customer UI only shows Payment Received after server-side state confirms payment.
- Seller payouts remain separate from customer collection.
- Payment/payout provider event tables exist for idempotency and audit.
- Provider keys are expected only in server-side environment secrets.
- Admin finance now treats Hubtel as the planned Ghana-first provider.

## Final live work after Hubtel provisioning
1. Confirm Hubtel's exact production authentication scheme and approved API base URLs.
2. Confirm collection methods enabled for RANOVA: MTN MoMo, Telecel Cash, AT Money, cards/bank where approved.
3. Confirm callback/webhook authentication and signature-verification rules.
4. Implement Hubtel payment initialization only from the server-side Edge Function.
5. Implement transaction verification from Hubtel before setting any order to paid.
6. Store every callback/event idempotently in `ranova_payment_provider_events`.
7. Confirm Hubtel's approved transfer product for seller MoMo/bank payouts.
8. Implement payout recipient validation and server-side transfer initiation.
9. Reconcile provider transaction references with RANOVA order/payment/payout IDs.
10. Test success, pending, failure, duplicate callback, retry, refund and payout failure cases.
11. Run a small controlled live transaction before public launch.

## Safety rule
A redirect, browser callback, screenshot, customer-entered reference or frontend success response must never by itself mark an order paid. Only a server-verified provider result may do that.
