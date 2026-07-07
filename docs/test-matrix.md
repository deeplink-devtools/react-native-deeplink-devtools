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

| #   | Scenario                                                                  | Command (from repo root unless noted)                                                                                         | iOS sim                                                                                                  | Android emu | Android USB |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| 1   | Custom scheme, app **installed** → app opens the route                    | `rndl open exampleexporouter://users/42 --platform ios`                                                                       | **pass 2026-07-08** (app installed via `expo run:ios`; opened /users/42, exit 0)                         | pending     | pending     |
| 2   | Custom scheme, app **not** installed → actionable failure                 | `rndl open exampleexporouter://users/42 --platform ios`                                                                       | **pass 2026-07-07** (`IOS_OPEN_FAILED`, LSApplicationWorkspaceErrorDomain code=115, no-app hint, exit 1) | pending     | pending     |
| 3   | `https://` URL → opens (Safari/browser without the app)                   | `rndl open https://example.com --platform ios`                                                                                | **pass 2026-07-07** (Safari opened, exit 0)                                                              | pending     | pending     |
| 4   | Route mode `--app-dir` + auto scheme from app.json                        | `rndl open '/users/:id' --app-dir example-expo-router/src/app --params id=42 --platform ios`                                  | **pass 2026-07-07** (built `exampleexporouter://users/42`; then row-2 no-app failure, app not installed) | pending     | pending     |
| 5   | Route mode `--config` (React Navigation), prefix from config              | `rndl open HomeTabs/Feed/Article --config example-react-navigation/src/navigation/linking.ts --params slug=hi --platform ios` | pending (needs app installed to fully open)                                                              | pending     | pending     |
| 6   | Route mode, missing required param → error **before** any device I/O      | `rndl open '/users/:id' --app-dir example-expo-router/src/app --platform ios`                                                 | **pass 2026-07-07** (`OPEN_MISSING_PARAMS`, exit 1, no simctl call)                                      | n/a         | n/a         |
| 7   | `--device` by name / udid / serial                                        | `rndl open https://example.com --platform ios --device "iPhone 17 Pro"`                                                       | **pass 2026-07-07** (opened on the named sim, exit 0)                                                    | pending     | pending     |
| 8   | `--device` unknown → error listing candidates                             | `rndl open https://example.com --platform ios --device "iPhone 99"`                                                           | **pass 2026-07-07** (`DEVICE_NOT_FOUND` + candidate list, exit 1)                                        | pending     | pending     |
| 9   | No booted sim / no attached device → actionable error                     | `rndl open x://y --platform android`                                                                                          | **pass 2026-07-07** (`NO_ANDROID_DEVICE`, exit 1)                                                        | pending     | pending     |
| 10  | Multiple devices (2 booted sims → recency pick + note; 2 Android → error) | (boot 2 sims, or attach 2 devices)                                                                                            | pending (1 sim available)                                                                                | pending     | pending     |
| 11  | Unauthorized adb device (before accepting USB prompt) → actionable error  | `rndl open x://y --platform android`                                                                                          | n/a                                                                                                      | n/a         | pending     |
| 12  | Omitted `--platform` (auto): one lane available → exit 0 + skip note      | `rndl open https://example.com`                                                                                               | **pass 2026-07-07** (iOS opened; Android skipped note; exit 0)                                           | pending     | pending     |
| 13  | URL with `&`/quotes in query survives the device shell                    | `rndl open "myapp://x?a=1&b=2" --platform android --package com.example`                                                      | n/a                                                                                                      | pending     | pending     |
| 14  | `--device` without an explicit single `--platform` → error                | `rndl open https://example.com --device X`                                                                                    | **pass 2026-07-07** (`DEVICE_FLAG_NEEDS_PLATFORM`, exit 1, no device touched)                            | n/a         | n/a         |

## Executed lanes (this session)

The **iOS sim** column rows 2, 3, 4, 6, 7, 8, 9, 12, 14 were executed 2026-07-07
against a booted iPhone 17 Pro (Xcode 26, iOS 26.4). Row 1 was executed
2026-07-08 once `npx expo run:ios` built and installed the example app (the
spaces-in-path blocker is now cleared). Row 5 (React Navigation, needs that
example app installed), a second device (row 10), and the entire **Android
emu**/**Android USB** columns remain **pending**: they need the React Navigation
build, an AVD, or physical hardware this host lacks. Maintainer to run those
lanes before release.

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

| #   | Scenario                                                                                 | Command                                                                                       | iOS sim                                                                        | Android emu | Android USB |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- | ----------- |
| I1  | App connects to the server; hello shows platform/router                                  | `rndl interactive --app-dir example-expo-router/src/app --platform ios`                       | **pass 2026-07-08** (iOS sim; hello platform=ios, router=expo-router)          | pending     | pending     |
| I2  | Fire a static route → live report, route match ✓                                         | select `/about`                                                                               | **pass 2026-07-08** (fired /about; matchedRoute /about, params {})             | pending     | pending     |
| I3  | Fire a `:id` route with a param → report shows param match ✓                             | select `/users/:id`, id=42                                                                    | **pass 2026-07-08** (fired /users/42; matchedRoute /users/:id, params {id:42}) | pending     | pending     |
| I4  | Fire a catch-all route → report matches the normalized pattern                           | select a `*slug` route                                                                        | pending (interactive TUI)                                                      | pending     | pending     |
| I5  | Deliberate mismatch (fire a route the app can't resolve) → red diff, matched shows ✗     | fire a route whose pattern the app maps to `+not-found`                                       | pending (interactive TUI)                                                      | pending     | pending     |
| I6  | No app connected → fire still works; timeout note explains wiring the reporter           | run without the app; select any route                                                         | pending (interactive TUI)                                                      | pending     | pending     |
| I7  | React Navigation app via `--config` → leaf-name match against ancestry-joined table name | `rndl interactive --config example-react-navigation/src/navigation/linking.ts --platform ios` | pending (interactive TUI)                                                      | pending     | pending     |
| I8  | Android auto `adb reverse` sets up the tunnel at startup and before each fire            | `rndl interactive --app-dir example-expo-router/src/app --platform android`                   | n/a                                                                            | pending     | pending     |
| I9  | Non-TTY stdin → `INTERACTIVE_NEEDS_TTY`, exit 1                                          | `rndl interactive < /dev/null`                                                                | **pass 2026-07-07** (exit 1)                                                   | n/a         | n/a         |
| I10 | `--port` honored end-to-end (server binds it; reporter `{ port }` connects)              | `rndl interactive --port 9000 …` + `useDeepLinkReporter({ port: 9000 })`                      | pending (interactive TUI)                                                      | pending     | pending     |

Row I9 needs no device and passed live. The **spaces-in-path build blocker is
now cleared**: at the current space-free repo path, `npx expo run:ios` builds
(Build Succeeded, 0 errors) and installs the example dev build on the iPhone 17
Pro simulator (Xcode 26.4, iOS 26).

On-device reporter lanes **I1, I2, and I3 passed live** (2026-07-08) on that
simulator: the real app's `useDeepLinkReporter()` connected and streamed a
correct hello (`platform=ios`, `router=expo-router`) plus report events for
`exampleexporouter://users/42` (matchedRoute `/users/:id`, params `{id:42}`) and
`exampleexporouter://about` (matchedRoute `/about`, params `{}`). These were
observed against a standalone server speaking the shipped reporter protocol
(`parseReporterMessage`), because `rndl interactive`'s TUI needs a TTY this
non-interactive session lacks (see I9); the TUI rendering itself is unit-tested.

The remaining interactive lanes (I4 to I7, I10) need the `rndl interactive` TUI
driven by hand and a free Metro port; the **Android** lanes need an AVD or device
this host lacks. The `adb reverse` argv (I8) is asserted in the unit tests even
without a device. **Maintainer** to run those, and to record the demo GIF.

## Demo GIF

The acceptance criterion asks for a demo GIF from a real `rndl interactive`
session. The native dev build now works (see above), so this is a straightforward
terminal recording for the maintainer: route pick, param prompt, fire, then the
live match or mismatch.
