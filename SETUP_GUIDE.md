# Local App and Backend Setup Guide

This guide explains how to run the Face Detection backend on your laptop and connect the mobile app to it from a real phone.

The working setup is:

```text
Phone running the app
  -> reaches the laptop over the hotspot network
Laptop running backend
  -> connected to the same phone hotspot
Backend URL entered in app
  -> http://<laptop-ip-address>:8080
```

Do not use `localhost` in the app when testing on a real phone. On the phone, `localhost` means the phone itself, not the laptop.

## Repository Layout

```text
face-detection/
  app/                     React Native mobile app
  face-detection-backend/  Go backend
  panel/                   Panel/frontend code
```

Backend command used for the local setup:

```sh
cd face-detection-backend
go run ./cmd/server
```

Mobile app folder:

```sh
cd app
```

## Prerequisites

Install the normal React Native and Go tooling before starting:

- Go, for running the backend.
- Node.js `>=18`, required by the app.
- Yarn classic, because the app uses `yarn@1.22.22`.
- Android Studio and Android SDK for Android builds.
- Xcode and CocoaPods for iOS builds.
- A real phone with camera permission enabled for the app.

The backend can run without Docker or MongoDB for local demo testing. By default it uses file storage under:

```text
face-detection-backend/data/
```

## 1. Start the Backend

Open a terminal from the backend folder:

```sh
cd /Users/a37970/Desktop/face-detection/face-detection-backend
go run ./cmd/server
```

Expected log lines include:

```text
using file store in data
face-detection backend listening on :8080
```

The default backend configuration is:

```text
PORT=8080
STORE_BACKEND=file
FILE_STORE_DIR=data
```

The server listens on `:8080`, which means it accepts requests on the laptop's local network IP as well as `localhost`.

## 2. Verify the Backend on the Laptop

In another terminal, run:

```sh
curl http://localhost:8080/health
```

Expected response:

```json
{"status":"ok"}
```

You can also open the API docs in a browser on the laptop:

```text
http://localhost:8080/docs
```

## 3. Connect the Laptop and Phone to the Same Network

For the setup that worked:

1. Turn on the phone hotspot.
2. Connect the laptop to that hotspot.
3. Keep the phone on the same hotspot/mobile network while opening the app.

This makes the phone and laptop reachable on the same local network path.

## 4. Find the Laptop IP Address

On macOS, run:

```sh
ipconfig getifaddr en0
```

Example output:

```text
172.20.10.2
```

Use your actual output, not the example.

The backend base URL for the app will be:

```text
http://172.20.10.2:8080
```

Replace `172.20.10.2` with your laptop IP address.

If `ipconfig getifaddr en0` returns nothing, check the active network interface:

```sh
networksetup -listallhardwareports
```

Then use the device name for the Wi-Fi interface.

## 5. Verify the Backend from the Phone

Before configuring the app, open the phone browser and visit:

```text
http://<laptop-ip-address>:8080/health
```

Example:

```text
http://172.20.10.2:8080/health
```

Expected response:

```json
{"status":"ok"}
```

If this does not load in the phone browser, the app will also not be able to reach the backend. Fix the network/backend access first.

Common causes:

- The laptop is no longer connected to the phone hotspot.
- The IP address changed after reconnecting to hotspot.
- The backend terminal stopped.
- macOS firewall blocked incoming connections to the Go process.
- The phone and laptop are not on the same network path.

## 6. Install and Run the Mobile App

From the app folder:

```sh
cd /Users/a37970/Desktop/face-detection/app
yarn install
```

Start Metro:

```sh
yarn start
```

In a second terminal, run the app.

For Android:

```sh
cd /Users/a37970/Desktop/face-detection/app
yarn android
```

For iOS:

```sh
cd /Users/a37970/Desktop/face-detection/app
cd ios
bundle exec pod install
cd ..
yarn ios
```

For a physical device, you can also build and run from Android Studio or Xcode if that is how the phone is normally deployed.

## 7. Configure the Backend Base URL in the App

Open the app on the phone.

The app has an API Settings screen for changing the backend base URL used by:

- onboarding user sync
- client registration
- auth event sync

Open API Settings from the small floating utility button on the right side of the app.

Enter the backend URL in this format:

```text
http://<laptop-ip-address>:8080
```

Example:

```text
http://172.20.10.2:8080
```

Tap:

```text
Save Base URL
```

The screen should show:

```text
Base URL saved. New API calls will use this URL.
```

The app persists this value in native storage, so it should stay configured after app restart unless app data is cleared.

## 8. Confirm App and Backend Are Working Together

After saving the base URL:

1. Complete onboarding in the app.
2. Enter the user/personnel ID when prompted.
3. Let the app finish local face enrollment.
4. Keep the backend terminal visible.
5. Watch for backend API calls when onboarding and sync run.

The app sends these backend calls during normal setup and sync:

```text
POST /api/users
POST /api/clients
POST /api/clients/<clientId>/sync/events
```

The app uses this tenant header:

```text
x-tenant-id: Cars24
```

On the backend, local file storage is updated under:

```text
face-detection-backend/data/
```

You can inspect backend data after onboarding:

```sh
ls -la /Users/a37970/Desktop/face-detection/face-detection-backend/data
```

Expected files can include:

```text
tenants.json
users.json
clients.json
auth_events.json
```

## 9. Optional: Run Backend with MongoDB

The simple local demo does not require MongoDB. Use Mongo only if you specifically want backend persistence in MongoDB.

Start MongoDB:

```sh
cd /Users/a37970/Desktop/face-detection/face-detection-backend
docker compose up -d mongo
```

Run the backend with Mongo:

```sh
STORE_BACKEND=mongo go run ./cmd/server
```

Mongo defaults:

```text
MONGO_URI=mongodb://localhost:27017
MONGO_DATABASE=face_detection
```

The app base URL stays the same:

```text
http://<laptop-ip-address>:8080
```

## Troubleshooting

### Phone cannot open `http://<ip>:8080/health`

Check the backend is running:

```sh
curl http://localhost:8080/health
```

Check the laptop IP again:

```sh
ipconfig getifaddr en0
```

If the IP changed, update the app API Settings screen.

Also check macOS firewall settings. If macOS asks whether to allow incoming connections for the Go binary or terminal, allow it for this local test.

### App works offline but backend data does not update

The face authentication flow is offline-first. Local onboarding/login can succeed even if backend sync fails.

Open the app's Sync Status screen and tap:

```text
Retry Sync Now
```

Also verify the saved base URL in API Settings.

### Do not use `localhost` on a real phone

These are wrong for a physical phone:

```text
http://localhost:8080
http://127.0.0.1:8080
```

Use the laptop IP:

```text
http://<laptop-ip-address>:8080
```

### Android debug HTTP support

The Android debug build allows cleartext HTTP traffic through:

```text
app/android/app/src/debug/AndroidManifest.xml
```

That is why `http://<ip>:8080` works for debug builds.

For production/release builds, use HTTPS or explicitly configure the intended network security policy.

### iOS local networking

iOS local networking is enabled in:

```text
app/ios/MorthHackathon/Info.plist
```

If iOS prompts for local network permission, allow it.

### Port 8080 already in use

Run the backend on another port:

```sh
PORT=8082 go run ./cmd/server
```

Then configure the app with:

```text
http://<laptop-ip-address>:8082
```

### Reconnecting hotspot can change the IP

If you disconnect/reconnect the laptop from the phone hotspot, the laptop IP can change.

Run this again:

```sh
ipconfig getifaddr en0
```

Then update API Settings in the app with the new URL.

## Quick Run Checklist

1. Start phone hotspot.
2. Connect laptop to phone hotspot.
3. Start backend:

   ```sh
   cd /Users/a37970/Desktop/face-detection/face-detection-backend
   go run ./cmd/server
   ```

4. Check laptop health:

   ```sh
   curl http://localhost:8080/health
   ```

5. Find laptop IP:

   ```sh
   ipconfig getifaddr en0
   ```

6. Check phone browser:

   ```text
   http://<laptop-ip-address>:8080/health
   ```

7. Open app API Settings.
8. Save:

   ```text
   http://<laptop-ip-address>:8080
   ```

9. Complete onboarding/login in the app.
10. Check backend data and app Sync Status.
