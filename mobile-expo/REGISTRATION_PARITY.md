# Registration parity contract — native RANOVA

The existing website is the source of truth for registration behavior. Do not simplify or replace its account logic merely to make a mobile form.

## Customer registration and login (from rpe-v2/app.js)
- Separate Sign in / Create account modes.
- Choice of email or phone.
- Password minimum eight characters and show/hide control.
- Phone country code and local number normalization.
- Account creation uses the existing server function `ranova-account-signup` (do **not** call Supabase auth.signUp directly as a substitute).
- After successful creation, sign in using Supabase `signInWithPassword`; for phone accounts use the server-returned `login_email` (the existing web fallback is a synthetic phone-based login email).
- Existing account errors direct the user back to Sign in.
- Email password recovery is available; do not invent insecure phone-password recovery.
- Maintain existing guest-browse restrictions and post-login user-state loading.

## Seller registration (from rpe-v2/seller-start.js)
- Preserve the seller start/welcome page and staged registration process.
- Preserve supported email/phone verification options and business application fields.
- Seller applications must use existing `ranova-seller-apply` server function, with authenticated session.
- Seller permissions are granted only after backend approval; registering an account alone never makes a user an approved seller.

## Native adaptation
- Use native TextInput, Pressable, keyboard-safe screens, secure password entry and mobile navigation; no WebView.
- Reuse the existing server endpoints and data validation. Confirm deep-link/OTP redirect behavior on Android/iOS before launch.
- Keep the existing website and authentication backend unchanged.
- Do not store raw passwords, service-role keys, or privileged tokens in source control.

## Implementation gate
The initial Expo app is a scaffold. Registration parity is **specified, not implemented or tested**. Next: implement and test the native customer auth screens against the server endpoint, then seller onboarding. Do not claim sign-up is working before end-to-end verification.
