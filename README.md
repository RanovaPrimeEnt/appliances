# RANOVA Admin Console App

This branch is the standalone source package for the RANOVA Admin Console.

## Purpose
This is the central control application for RANOVA. Authorized admin roles use it to manage platform operations that affect the customer and seller apps through the shared Supabase backend.

## Included frontend
- index.html — standalone Admin Console entry page
- admin.html — same live Admin Console page
- admin.js — complete Admin Console client logic
- design-system.css — RANOVA shared Admin design system
- config.js — public Supabase project configuration used by the web client

## Included protected backend source
See /backend. These are source backups of the deployed Supabase Edge Functions used by or supporting the Admin Console.

- ranova-admin-marketplace — central admin authorization/actions/dashboard
- ranova-payment-gateway — protected customer payment verification, provider webhooks, refund/payout settlement support
- ranova-rate-sync — official finance/rate synchronization
- ranova-notify-dispatch — transactional notification dispatch
- ranova-country-service — country/reference data used by marketplace finance/delivery
- ranova-after-sales — cancellation/return workflow integrated with Admin cases

## Major Admin responsibilities already represented
- Core RPE orders/products/stock
- Seller applications and verification documents
- Seller product moderation
- Seller store control
- Reviews and trust
- Seller performance, enforcement and appeals
- Discovery and sponsored placements
- Inventory reservations and expiry
- Marketplace orders
- Delivery review and proof
- Refunds, disputes and after-sales cases
- Safety reports and risk flags
- Finance settings and country rules
- Customer payment confirmation
- Protected seller payouts
- Payment provider status
- Financial reconciliation
- Admin role-based permissions and audit logging

## Security
Do not put Supabase service-role keys, Paystack secret keys, bank credentials or other private secrets in this frontend package. Those belong only in protected Supabase/hosting secrets.

The public config.js contains only the browser-safe Supabase publishable configuration already used by the live application.

## Live backend
Supabase project: igaerssbzobutlwvjfwt

The downloaded Admin App remains connected to the same protected RANOVA backend unless you intentionally change config.js.

## Deployment
Serve this directory through HTTPS. Open index.html. Authorized RANOVA Admin users sign in through Supabase Auth and server-side role checks remain authoritative.

Generated from the live RANOVA project on 2026-09-27.
