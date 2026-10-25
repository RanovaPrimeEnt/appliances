# RANOVA APK and Expo integration

The existing Android APK is built from `android-app/` on `main`, by `.github/workflows/build-ranova-apk.yml`. Its `MainActivity.java` loads the hosted marketplace at:
https://ranovaprimeent.github.io/appliances/rpe-v2/?source=android

This branch's Expo project is a separate React Native app. To preserve the current native catalogue and account screens, the hosted marketplace is available as an **optional** in-app WebView route at `app/marketplace.tsx`. This is a compatibility bridge, **not** a conversion of the website to native React Native screens.

To test, from `mobile-expo/` run `npx expo install react-native-webview` and then `npx expo start --tunnel --clear`. Navigate from the home screen's `Full marketplace` link.

Do not copy `android-app/` Gradle or Java files into `mobile-expo/`. The existing hosted marketplace and its authentication/session cookies may differ from the Expo app's Supabase session; verify account and checkout flows before production. This bridge does not provide production parity or independently native shopping features.
