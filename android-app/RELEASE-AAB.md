# Ranova Android release bundles

This Android project builds two apps against the **same Ranova web marketplace**.

| Variant | Package | Gradle task | Output |
| --- | --- | --- | --- |
| Customer | `com.ranova.marketplace` | `:app:bundleCustomerRelease` | `app/build/outputs/bundle/customerRelease/app-customer-release.aab` |
| Seller | `com.ranova.seller` | `:app:bundleSellerRelease` | `app/build/outputs/bundle/sellerRelease/app-seller-release.aab` |

Both variants currently load the same website and share its existing customer-first registration, seller onboarding, and login flow. The Seller app **does not yet automatically open the seller dashboard**; that requires a supported route in the web application. Do not claim this feature is complete until verified.

## Build
Run from `android-app` with Java 17, Android SDK 36 and Gradle 8.11.1:

```bash
gradle :app:bundleCustomerRelease :app:bundleSellerRelease
```

The GitHub Actions workflow `.github/workflows/ranova-aab.yml` builds both bundles and uploads them as a workflow artifact. A successful CI run must be verified before using any bundle.

## Signing for Google Play
Create a secure Android upload key locally and retain a backup. Do **not** commit the keystore or passwords. Add these four GitHub Actions repository secrets:

- `RANOVA_KEYSTORE_BASE64`: base64-encoded upload keystore bytes (single line)
- `RANOVA_KEYSTORE_PASSWORD`
- `RANOVA_KEY_ALIAS`
- `RANOVA_KEY_PASSWORD`

The workflow decodes the keystore on the runner and passes signing settings through environment variables. Without a configured keystore, generated release bundles are unsigned and **cannot be submitted** as signed releases. Keep Play App Signing enabled in Play Console. For an existing published Customer app, use the correct existing upload key, not a new incompatible one.

## Pre-release checks
- Verify both bundle builds succeed and inspect the workflow artifact.
- Confirm account login, customer registration, switch-to-seller, seller approval, logout and return navigation on Android.
- Test payment handoff, uploads, camera/microphone permissions and external links.
- Confirm seller-specific entry route if a different landing experience is desired.
- Verify package IDs, app icons, Play Console listings, policies, and signing certificate fingerprints.
