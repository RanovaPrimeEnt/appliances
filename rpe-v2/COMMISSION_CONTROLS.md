## Rate reduction — 2026-09-28

The owner reduced the Ghana-to-Ghana commission to 8.5%, excluding delivery. Version 2 supersedes the 10% policy for new orders; existing order snapshots and all provider fee settings are unchanged.

## Owner rate approval — 2026-09-28

The owner approved 10% commission for new Ghana-to-Ghana product sales, excluding delivery. An active GH → GH GHS rule was inserted with its approval reason. Existing order snapshots and provider fees were not changed. The global fallback remains 0%. The admin example now uses 10%. Payment-provider setup is still required for automatic collections.

# Country commission controls

The owner Finance screen now includes a server-calculated earnings preview. It can resolve the active policy for a store, seller country, buyer country, payment method and settlement currency, or simulate the unsaved form. The 5% Ghana launch button prepares an inactive, unsaved owner-policy proposal. It does not publish rates or charge anyone.

Commission is computed on product subtotal after discounts; delivery is excluded. Provider costs remain separate and the preview shows who pays them, buyer total, seller payout and RANOVA's commission less any platform-paid provider costs. This is not a net-profit or tax calculation.

Live findings on 2026-09-28: the sole active country rule is 0% commission, all 84 marketplace products use GHS, and the payment gateway reports Paystack not configured. No commission rules, payment secrets, orders or payouts were changed by this work.

A shared server module selects only current, active rules in the settlement currency. Future, historical, inactive and foreign-currency rules cannot accidentally set an order's commission. Store contracts outrank seller-country rules, which outrank buyer-country and payment-method rules. Missing policies fail with an explicit error instead of silently falling back to zero. Checkout and negotiated cart quotes reject unsupported product/quote currencies rather than treating their amounts as GHS.

Current settlement support remains GHS. International currency collection, FX rates, conversion fees and cross-border seller payouts are not implemented by adding currency labels. Country-specific rates are owner commercial decisions. Provider charges must be checked against the connected merchant agreement before activating deductions.

Existing order-rate snapshots and payment-confirmation/payout processing remain in place. Real provider collection cannot be tested until a provider is configured. Refunds and payout eligibility remain governed by the existing workflows; this change does not implement new money transfers or refund automation.

Verification: 13 policy/arithmetic tests and 6 endpoint authorization/read-only tests pass. A Chromium component test checks that the proposal remains inactive and unsaved and that the preview sends only a preview request. Full live payment/settlement was not exercised.

Run Node 24+: `node --test tests/commission.test.mjs tests/commission-endpoint.test.mjs`.
With Playwright available: `CHROMIUM_PATH=/path/to/chromium node tests/commission-browser.cjs`.
