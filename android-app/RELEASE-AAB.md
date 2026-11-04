# Unified Ranova Android release

Ranova is **one Android application** with one customer-first account system and a built-in **Switch to Seller** flow. Seller registration and approval remain features of the same web marketplace.

- App ID: `com.ranova.marketplace`
- Android app name: `RANOVA`
- Gradle build task: `:app:bundleRelease`
- Bundle output: `android-app/app/build/outputs/bundle/release/app-release.aab`
- CI workflow: `.github/workflows/ranova-aab.yml`

## Build

Run from `android-app` with Java 17, Android SDK 36 and Gradle 8.11.1:

```bash
gradle :app:bundleRelease
```

The workflow uploads the bundle as a GitHub Actions artifact after a successful run. The build has **not yet been verified**.

## Secure release signing

Configure these repository secrets without committing passwords or the upload key:

- `RANOVA_KEYSTORE_BASE64` (base64 of the Android upload keystore)
- `RANOVA_KEYSTORE_PASSWORD`
- `RANOVA_KEY_ALIAS`
- `RANOVA_KEY_PASSWORD`

Without a valid upload key the resulting bundle is not ready for Google Play submission. If this app was previously published, use the correct existing upload key or the approved reset procedure.

## Pre-release validation

Test customer registration/login, Switch to Seller, seller registration and approval, seller dashboard, returning to customer mode, shopping and checkout, uploads, permissions and payment redirects. Verify the Google Play listing and current policy requirements. Keep the existing website and backend as the source of truth for both user experiences.
