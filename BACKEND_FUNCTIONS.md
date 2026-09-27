# Admin Console Backend Map

The Admin Console is the command center. Frontend buttons do not directly alter protected tables; privileged changes go through authenticated backend functions and database controls.

## Central Admin API
ranova-admin-marketplace
- dashboard/role-aware data
- seller application review
- verification stage decisions
- product moderation
- store state changes
- trust/review moderation
- performance/enforcement/appeals
- sponsored placements
- inventory admin controls
- delivery review
- refunds/disputes/after-sales decisions
- safety/risk review
- finance rules/settings
- payment confirmation
- protected seller payout initiation
- provider refund initiation
- reconciliation review
- audit logs / notifications

## Payment & settlement
ranova-payment-gateway
- payment initialization
- payment verification
- signed Paystack webhook processing
- exact amount/currency checks
- atomic payment confirmation
- payout/refund provider-event handling

## Supporting services
ranova-rate-sync — official external finance/rate updates
ranova-notify-dispatch — queued transactional notifications
ranova-country-service — country reference data
ranova-after-sales — cancellation and return case operations

## Shared database protections
Admin actions are also protected by RLS, server-only SQL functions, immutable snapshots, payout eligibility checks, inventory reservation rules and audit/event tables.
