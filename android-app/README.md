# RANOVA Mobile v1

This folder contains the Android shell for the RANOVA customer marketplace.

## Current Android app

- App label: RANOVA
- Package: com.ranova.marketplace
- Minimum Android: API 24
- Current test version: 1.0.3
- Marketplace URL: https://ranovaprimeent.github.io/appliances/rpe-v2/
- Production web traffic is HTTPS-only.

## What the native shell supports

- JavaScript and DOM storage for the existing RANOVA web application.
- Persistent cookies/session behavior for authentication.
- Android file picker for seller/customer uploads.
- Camera and microphone permission hand-off for web messaging/media features.
- Android Back button navigation inside the marketplace.
- Non-HTTP phone links (for example tel:, mailto:, supported app links) are handed to Android.
- Downloads are handed to Android.
- Browser PWA install controls are hidden when the site is already running inside a RANOVA native shell.

## Build a test APK

The GitHub workflow `.github/workflows/build-ranova-apk.yml` validates the Android project.

For feature-branch builds it uploads:

`RANOVA-v1-Android-test / RANOVA-v1-test.apk`

When changes reach `main`, the workflow also publishes the latest downloadable Android test APK in the repository releases.

## Physical-phone test checklist

1. Install the APK and open RANOVA from the launcher icon.
2. Create an account or sign in.
3. Close and reopen the app and confirm the session is retained.
4. Browse the Home/Marketplace and open a product.
5. Open a seller store and return Home.
6. Save/favorite a product.
7. Add items to cart and change quantity.
8. Open Messages and send text.
9. Test image/file attachment.
10. Test camera/microphone features and accept permissions when prompted.
11. Open Orders/checkout flow without completing a real payment unless the payment environment is ready.
12. Test seller registration/document upload if using the seller entry path.
13. Test Android Back navigation.
14. Rotate the phone and confirm the current screen is preserved.
15. Close and relaunch RANOVA.

## iPhone compatibility

The shared `rpe-v2` application remains platform-neutral. Native-shell detection recognizes both:

- `RANOVA-Android/`
- `RANOVA-iOS/`

The iOS shell will use the same hosted customer application and backend. iOS packaging/signing will be added separately with Xcode/TestFlight; Android-only business logic should not be added to `rpe-v2`.
