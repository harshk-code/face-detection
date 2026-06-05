This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Offline Face Auth — architecture

On-device face recognition (MobileFaceNet ArcFace via TFLite) + liveness, with a
crash-safe offline sync to the backend. Core logic lives in `src/faceAuth/` and
is unit-tested without a device (`yarn test`, 35 tests).

- **Recognition** — `embeddingModel.ts` (512-d TFLite), `matching.ts`
  (`matchFaceEmbedding` 1:1, `identifyFace` 1:N with an anti-look-alike margin).
- **Liveness** — `liveness/geometry.ts` (EAR / smile / yaw from MediaPipe
  FaceMesh) + `liveness/engine.ts` (randomized blink/smile/head-turn challenge
  state machine; defeats print/replay spoofs).
- **Enrollment** — `enrollment.ts` averages several quality-gated frames into one
  robust template.
- **Offline sync (ACK-before-purge)** — `syncQueue.ts` durably queues auth
  events, retries, dedupes by `eventId`, and only deletes a local event after the
  backend acknowledges a purge (`/sync/events` → `/sync/purge-ack`). Wired via
  `authEventQueue.ts`; flushes leftover events on app start.
- **Encryption at rest** — biometric templates and the event queue are stored in
  Android `EncryptedSharedPreferences` (Keystore) and iOS Keychain, not plaintext.

> **iOS native note:** `ios/MorthHackathon/EventQueueStore.swift` and
> `EventQueueStoreBridge.m` are new — add them to the Xcode target so the encrypted
> event queue persists on iOS. Until then the queue falls back to in-memory on iOS
> (Android is fully wired). Run `bundle exec pod install` after pulling.

Run the tests:

```sh
yarn test
```

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
