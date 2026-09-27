# Seller onboarding implementation and verification

Switch to Seller opens seller-start.html. The two screens retain the supplied mobile references, translated to English with orange branding. The eight benefit categories explain what is available and what is planned. No unavailable rewards or third-party certifications are promised.

## Registration behavior

- Existing customer sessions are reused. A signed-in buyer confirms business contact details and consent without another OTP.
- New users verify by email code or magic link. Phone SMS stays disabled unless the project's public Auth settings explicitly enable it.
- Signed-in sellers are checked through the authenticated seller workspace before a new application is submitted. Linked sellers resume their existing workspace without relinking or resetting verification stages.
- Invalid codes, expired callbacks, changed email addresses, session changes, service errors, blocked storage, and malformed saved data produce recoverable states.
- After a successful application response, its reference is preserved in memory and browser session storage. Retrying a failed link reuses that reference.
- Approval and document verification still happen in the existing Seller Center. No approval rules are bypassed.
- Supabase browser SDK is pinned to 2.117.2.

## Verification on 2026-09-27

16 Chromium browser scenarios passed in tests/seller-onboarding.cjs. Network requests were intercepted, so no emails, SMS messages, accounts or real applications were created.

Covered: navigation and eight dialogs; widths 320/390/768 without horizontal overflow; required consent; unavailable SMS; successful email OTP/application/link sequence; invalid OTP; changed email; delivery errors; signed-in buyers; existing sellers; failed link retry without another create call; malformed/blocked storage; failed workspace lookup; expired sign-in links; enabled SMS behavior; expired sessions; authenticated callback; and initialization with the actual pinned Supabase SDK.

Screenshots were visually inspected. JS syntax, duplicate HTML IDs, local assets/navigation destinations, and git whitespace checks passed. agent-browser daemon could not start in this environment; browser verification used Playwright with Chromium instead.

Read-only live check: Supabase Auth settings returned HTTP 200 with email enabled, signups enabled, and phone disabled. This is why SMS is unavailable in the current interface.

Run with Playwright installed:

```sh
CHROMIUM_PATH=/path/to/chromium node tests/seller-onboarding.cjs
```

Set SUPABASE_SDK_PATH to the downloaded 2.117.2 UMD JavaScript file to include the sixteenth real-SDK initialization scenario. SCREENSHOT_DIR optionally records the two screens. Tests intercept all requests, including calls to the production hostname.

## Remaining release checks

A real test email and the user's access to its verification message are required to verify delivery, the email template, the redirect allowlist, authenticated application creation/linking, and the handoff into the actual Seller Center. The mocked tests do not establish that these production services work together.

The existing public application endpoint has no server-side idempotency key. If a response is lost after the server creates the application, the client cannot recover the reference automatically. Reference-preserving retries cover successful create responses followed by link failures, not this ambiguous network failure or simultaneous submissions in different tabs.

This remains an unpublished draft. No live database records were deleted or modified during verification. seller-design-preview.html is a self-contained visual preview with registration disabled.
