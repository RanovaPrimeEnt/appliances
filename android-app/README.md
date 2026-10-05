# RANOVA Mobile

RANOVA now has an Android store-build track and a companion iOS source project.

## Android
- Package: `com.ranova.marketplace`
- Minimum Android: API 24
- Compile/target SDK: 36
- Release version: 1.1.0 (5)
- Production artifact: Android App Bundle (.aab)
- Hosted marketplace: https://ranovaprimeent.github.io/appliances/rpe-v2/

The release build disables Android backup for account/session safety, keeps cleartext traffic disabled, enables code/resource shrinking, and supports a private upload keystore supplied only through CI/local environment variables.

## Signing
Never commit the upload keystore or passwords. Configure:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The release workflow can then produce a Play-ready signed AAB. Without those secrets it still validates the release build but the bundle is not ready to upload.

## iOS
See `../ios-app/`. The iOS target uses the same customer marketplace/backend and has its own bundle ID `com.ranova.marketplace`.

## Release gate
Before production, test authentication, seller/customer isolation, orders, payments, messaging, uploads, privacy/account deletion, security policies and real devices.
