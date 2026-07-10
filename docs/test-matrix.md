# `rndl open` manual test matrix

`rndl open` shells out to `xcrun simctl` (iOS simulators) and `adb` (Android
devices/emulators), so its device-facing behavior can't be fully covered by unit
tests. This grid is executed before each minor release. Unit tests cover URL
building, device parsing/selection, and the open argv (see
`packages/core/src/url.test.ts`, `packages/cli/src/devices.test.ts`,
`packages/cli/src/commands/open.test.ts`); this matrix covers the parts that
need real hardware.

Columns: **iOS sim** (Xcode Simulator) · **Android emu** (AVD) · **Android USB**
(physical device). Record `pass`/`fail` + date, or `pending` when the lane is
unavailable.

Physical iOS devices are **out of scope**: `simctl` drives simulators only.

| #   | Scenario                                                                  | Command (from repo root unless noted)                                                                                         | iOS sim                                                                                                        | Android emu                                                                                                  | Android USB |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| 1   | Custom scheme, app **installed** → app opens the route                    | `rndl open exampleexporouter://users/42 --platform ios`                                                                       | **pass 2026-07-08** (app installed via `expo run:ios`; opened /users/42, exit 0)                               | **pass 2026-07-10** (installed via `expo run:android`; app foregrounded, reporter echoed /users/:id {id:42}) | pending     |
| 2   | Custom scheme, app **not** installed → actionable failure                 | `rndl open exampleexporouter://users/42 --platform ios`                                                                       | **pass 2026-07-07** (`IOS_OPEN_FAILED`, LSApplicationWorkspaceErrorDomain code=115, no-app hint, exit 1)       | **pass 2026-07-10** (`ANDROID_OPEN_FAILED`, unresolved intent + intent-filter hint, exit 1)                  | pending     |
| 3   | `https://` URL → opens (Safari/browser without the app)                   | `rndl open https://example.com --platform ios`                                                                                | **pass 2026-07-07** (Safari opened, exit 0)                                                                    | **pass 2026-07-10** (browser opened, exit 0)                                                                 | pending     |
| 4   | Route mode `--app-dir` + auto scheme from app.json                        | `rndl open '/users/:id' --app-dir example-expo-router/src/app --params id=42 --platform ios`                                  | **pass 2026-07-07** (built `exampleexporouter://users/42`; then row-2 no-app failure, app not installed)       | **pass 2026-07-10** (built `exampleexporouter://users/42`, opened in the app, exit 0)                        | pending     |
| 5   | Route mode `--config` (React Navigation), prefix from config              | `rndl open HomeTabs/Feed/Article --config example-react-navigation/src/navigation/linking.ts --params slug=hi --platform ios` | **pass 2026-07-10** (opened `examplereactnavigation://feed/article/hi`; reporter confirmed Article {slug: hi}) | **pass 2026-07-10** (same URL; reporter observed Article {"slug":"hi"})                                      | pending     |
| 6   | Route mode, missing required param → error **before** any device I/O      | `rndl open '/users/:id' --app-dir example-expo-router/src/app --platform ios`                                                 | **pass 2026-07-07** (`OPEN_MISSING_PARAMS`, exit 1, no simctl call)                                            | n/a                                                                                                          | n/a         |
| 7   | `--device` by name / udid / serial                                        | `rndl open https://example.com --platform ios --device "iPhone 17 Pro"`                                                       | **pass 2026-07-07** (opened on the named sim, exit 0)                                                          | **pass 2026-07-10** (`--device emulator-5554` opened, exit 0)                                                | pending     |
| 8   | `--device` unknown → error listing candidates                             | `rndl open https://example.com --platform ios --device "iPhone 99"`                                                           | **pass 2026-07-07** (`DEVICE_NOT_FOUND` + candidate list, exit 1)                                              | **pass 2026-07-10** (`DEVICE_NOT_FOUND` + attached serials, exit 1)                                          | pending     |
| 9   | No booted sim / no attached device → actionable error                     | `rndl open x://y --platform android`                                                                                          | **pass 2026-07-07** (`NO_ANDROID_DEVICE`, exit 1)                                                              | **pass 2026-07-10** (emulator off: `NO_ANDROID_DEVICE`, exit 1)                                              | pending     |
| 10  | Multiple devices (2 booted sims → recency pick + note; 2 Android → error) | (boot 2 sims, or attach 2 devices)                                                                                            | **pass 2026-07-10** (2 booted sims; picked the most recently booted + note, exit 0)                            | **pass 2026-07-10** (`MULTIPLE_ANDROID_DEVICES` + serial list, exit 1)                                       | pending     |
| 11  | Unauthorized adb device (before accepting USB prompt) → actionable error  | `rndl open x://y --platform android`                                                                                          | n/a                                                                                                            | n/a                                                                                                          | pending     |
| 12  | Omitted `--platform` (auto): open where devices exist                     | `rndl open https://example.com`                                                                                               | **pass 2026-07-07** (iOS opened; Android skipped note; exit 0)                                                 | **pass 2026-07-10** (both lanes present: opened on the sim and the emulator, exit 0)                         | pending     |
| 13  | URL with `&`/quotes in query survives the device shell                    | `rndl open "myapp://x?a=1&b=2" --platform android --package com.example`                                                      | n/a                                                                                                            | **pass 2026-07-10** (app received `x?a=1&b=2` intact; reporter echoed {"a":"1","b":"2"})                     | pending     |
| 14  | `--device` without an explicit single `--platform` → error                | `rndl open https://example.com --device X`                                                                                    | **pass 2026-07-07** (`DEVICE_FLAG_NEEDS_PLATFORM`, exit 1, no device touched)                                  | n/a                                                                                                          | n/a         |

## Executed lanes

The **iOS sim** column rows 2, 3, 4, 6, 7, 8, 9, 12, 14 were executed 2026-07-07
against a booted iPhone 17 Pro (Xcode 26, iOS 26.4); row 1 on 2026-07-08 once
`npx expo run:ios` installed the example dev build; rows 5 and 10 on 2026-07-10
(React Navigation example built and installed, plus a temporary second
simulator for the recency pick).

The **Android emu** column was executed 2026-07-10 against the
`Medium_Phone_API_36.1` AVD (API 36.1, arm64): both example apps were built and
installed with `npx expo run:android`, row 9 ran with the emulator off, row 2
ran before the first install, and row 10 used a temporary second AVD (created
from the installed system image, deleted afterwards). Where a cell cites the
reporter, the evidence is the in-app `useDeepLinkReporter()` echo observed over
the dev transport, which confirms the URL the app actually received and the
route it resolved.

Only row 11 and the **Android USB** column remain **pending**: they need a
physical Android device this host lacks. Maintainer to run those lanes before
release.

---

# `rndl interactive` + runtime reporter manual test matrix

`rndl interactive` runs a WebSocket server the in-app reporter
(`@deeplink-devtools/runtime`) connects to, fires deep links on devices (reusing
the `rndl open` machinery), and renders the live match the app reports. The
session loop, comparison rendering, `adb reverse` wiring, and the reporter
transport client are unit-tested with fakes (`packages/cli/src/commands/interactive.test.ts`,
`packages/cli/src/reporter-server.test.ts`, `packages/runtime/src/internal/client.test.ts`);
this grid covers the device- and app-facing parts that need a real build.

Prerequisite for the reporter lanes: a **development build** of the example app
with `useDeepLinkReporter()` wired (already done in `example-expo-router`
`src/app/_layout.tsx` and `example-react-navigation` `src/App.tsx`), built via
`npx expo run:ios` / `run:android`.

| #   | Scenario                                                                                 | Command                                                                                       | iOS sim                                                                        | Android emu                                                                    | Android USB |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------- |
| I1  | App connects to the server; hello shows platform/router                                  | `rndl interactive --app-dir example-expo-router/src/app --platform ios`                       | **pass 2026-07-08** (iOS sim; hello platform=ios, router=expo-router)          | **pass 2026-07-10** (hello platform=android, router=expo-router)               | pending     |
| I2  | Fire a static route → live report, route match ✓                                         | select `/about`                                                                               | **pass 2026-07-08** (fired /about; matchedRoute /about, params {})             | **pass 2026-07-10** (fired /about; matchedRoute /about, params {})             | pending     |
| I3  | Fire a `:id` route with a param → report shows param match ✓                             | select `/users/:id`, id=42                                                                    | **pass 2026-07-08** (fired /users/42; matchedRoute /users/:id, params {id:42}) | **pass 2026-07-10** (fired /users/42; matchedRoute /users/:id, params {id:42}) | pending     |
| I4  | Fire a catch-all route → report matches the normalized pattern                           | select a `*slug` route                                                                        | **pass 2026-07-10** (report matched `/posts/*slug`; see catch-all note below)  | **pass 2026-07-10** (same result as iOS)                                       | pending     |
| I5  | Deliberate mismatch (fire a route the app can't resolve) → red diff, matched shows ✗     | fire a route whose pattern the app maps to `+not-found`                                       | **pass 2026-07-10** (red diff: route /+not-found ✗, fired /contact)            | **pass 2026-07-10** (red diff: route /+not-found ✗, fired /contact)            | pending     |
| I6  | No app connected → fire still works; timeout note explains wiring the reporter           | run without the app; select any route                                                         | **pass 2026-07-10** (URL opened; no-report note with wiring guidance)          | **pass 2026-07-10** (URL opened; no-report note with wiring guidance)          | pending     |
| I7  | React Navigation app via `--config` → leaf-name match against ancestry-joined table name | `rndl interactive --config example-react-navigation/src/navigation/linking.ts --platform ios` | **pass 2026-07-10** (hello router=react-navigation; route Notifications ✓)     | **pass 2026-07-10** (hello router=react-navigation; route Notifications ✓)     | pending     |
| I8  | Android auto `adb reverse` sets up the tunnel at startup and before each fire            | `rndl interactive --app-dir example-expo-router/src/app --platform android`                   | n/a                                                                            | **pass 2026-07-10** (tcp:7635 set from a clean table; tcp:9000 for `--port`)   | pending     |
| I9  | Non-TTY stdin → `INTERACTIVE_NEEDS_TTY`, exit 1                                          | `rndl interactive < /dev/null`                                                                | **pass 2026-07-07** (exit 1)                                                   | n/a                                                                            | n/a         |
| I10 | `--port` honored end-to-end (server binds it; reporter `{ port }` connects)              | `rndl interactive --port 9000 …` + `useDeepLinkReporter({ port: 9000 })`                      | **pass 2026-07-10** (ws://localhost:9000; hello + report round-trip)           | **pass 2026-07-10** (ws://localhost:9000; hello + report round-trip)           | pending     |

## Executed lanes

Lanes I1 to I3 passed on the iOS simulator on 2026-07-08 (documented in the
session notes below). The remaining iOS lanes (I4 to I7, I10) and the entire
**Android emu** column (I1 to I8, I10) were executed 2026-07-10 with the real
`rndl interactive` binary driven through a scripted terminal session (a pty
wrapper feeding the select/text prompts), against the dev builds of both
example apps on the iPhone 17 Pro simulator and the `Medium_Phone_API_36.1`
emulator. Every pass cell above reflects the report comparison rendered by the
session and captured in the transcript.

Lane recipes worth keeping:

- **I5 (mismatch):** start the session (the route table is loaded once at
  startup), then move `contact.tsx` out of the app dir; Metro fast-refreshes
  the running app, which now maps `/contact` to `+not-found`. Firing `/contact`
  from the stale table renders the red diff. Restore the file afterwards.
- **I6 (no app):** run the session on an alternate `--port` while the app's
  reporter stays on the default; the fire opens the URL and the 10s timeout
  note appears with the wiring guidance.
- **I10 (custom port):** point `useDeepLinkReporter({ port: 9000 })` in the
  app, reload it, and run `rndl interactive --port 9000`; on Android the
  session reverses tcp:9000 automatically.

Observed behavior notes (not failures, worth knowing):

- **Catch-all params echo as arrays:** Expo Router's `useGlobalSearchParams()`
  returns catch-all segments as an array, so after an I4 fire the param diff
  shows `slug: fired 'one/two/three', app got '["one","two","three"]' ✗` even
  though the route line matches. Cosmetic only; a future polish could join
  array values for catch-all params before comparing.
- **Buffered reports can consume the first fire window:** the runtime client
  buffers up to 20 reports while no server is connected (including the app's
  initial launch URL). Right after an app relaunch, the first fire's report
  window may be resolved by a stale buffered report; later reports surface as
  "deep link observed" notes. Fire once more, or let the backlog drain, before
  reading the comparison.

Only the **Android USB** column remains pending: it needs a physical device
this host lacks. Maintainer to run it before release.

## Demo GIF

Recorded and committed (see the root README): a real `rndl interactive`
session showing route pick, param prompt, fire, and the live match.
