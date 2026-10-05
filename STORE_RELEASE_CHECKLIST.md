# RANOVA Store Release Checklist

## Android / Google Play
- Package ID: `com.ranova.marketplace`
- Target SDK: 36
- Production artifact: Android App Bundle (.aab)
- Keep Play App Signing enabled.
- Configure repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Complete Play Console Data safety, content rating, app access, ads declaration, target audience, privacy policy URL, account deletion URL, screenshots and feature graphic.
- Use internal testing before production.

## iOS / App Store
- Bundle ID: `com.ranova.marketplace`
- iOS deployment target: 15.0
- Generate the Xcode project from `ios-app/project.yml`.
- Add the RANOVA App Icon asset before archive submission.
- Apple Developer signing and App Store Connect credentials must stay outside Git.
- Complete App Privacy, age rating, support URL, privacy URL, screenshots, review notes and TestFlight testing.

## Release gate
Do not publish production until authentication, seller/customer isolation, orders, payments, messaging, uploads, account deletion, RLS/security advisors and real-device tests pass.
