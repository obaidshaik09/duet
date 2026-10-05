# Android demo (Capacitor)

## Pre-demo check (run right before presenting)

With the server running (`npm start`) in one terminal, run in another:

```bash
npm test          # parser unit tests
npm run test:e2e  # API, two-caregiver live sync, PWA files, Android project config
npm run test:ui   # real Edge browser: phone + desktop, voice, edit/delete, offline
```

All three should end with `0 failed`. Screenshots from the UI run land in `test-results/`.

Duet is one web codebase wrapped with Capacitor for a class Android emulator demo.

## What you need on your PC

1. **Android Studio** (free) — https://developer.android.com/studio  
   During setup, install:
   - Android SDK
   - Android SDK Platform-Tools
   - At least one system image (e.g. Pixel 6 / API 34)
2. **JDK 17+** (Android Studio’s bundled JDK is fine)
3. Node deps in this project (`npm install`)

This machine did **not** have Android Studio/SDK, so the emulator was not launched here. The `android/` project is already generated and synced.

## One-time / after web changes

```bash
cd "c:\Users\obaid\OneDrive\Desktop\AI Intg Class\Duet"
npm install
npm run cap:sync
```

That builds the PWA into `dist/`, copies icons/splash into Android resources, and syncs into `android/`.

## Run the backend (required for the emulator)

```bash
npm start
```

Server listens on **`0.0.0.0:5000`**.  
The Android emulator reaches your PC at **`http://10.0.2.2:5000`** (wired in `src/config.js`). Cleartext HTTP is allowed in the Android manifest for this demo.

## Open & run in Android Studio

```bash
npm run cap:open
```

Or open the folder `android/` directly in Android Studio.

Then:

1. Wait for Gradle sync to finish  
2. Device Manager → create/start a Virtual Device (API 34 recommended)  
3. Run the `app` configuration (green Play button)  
4. Allow **microphone** when logging by voice  

App id: `com.duet.household` · App name: **Duet**

## Voice in the Android shell

| Surface | Speech path |
|--------|-------------|
| Chrome / desktop browser | Web Speech API |
| Capacitor Android WebView | `@capacitor-community/speech-recognition` (native) |

In the Android app: tap mic to start, tap again when finished speaking. Text entry works the same as the browser.

## Web install (Add to Home Screen)

With `npm start` (or `npm run build` then serve `dist`), open the site:

- **Android Chrome** → ⋮ → Install app / Add to Home screen  
- **iOS Safari** → Share → Add to Home Screen  

Manifest + `apple-touch-icon` + apple-mobile-web-app meta tags are included; the service worker precaches the app shell.

## Physical phone on same Wi‑Fi (optional)

Create `.env` in the project root before build:

```
VITE_API_BASE=http://YOUR_PC_LAN_IP:5000
```

Then `npm run cap:sync` again.
