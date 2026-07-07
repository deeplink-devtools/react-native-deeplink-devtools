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

| #   | Scenario                                                                  | Command (from repo root unless noted)                                                                                         | iOS sim                                                                                                   | Android emu | Android USB |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| 1   | Custom scheme, app **installed** → app opens the route                    | `rndl open exampleexporouter://users/42 --platform ios`                                                                       | pending (needs `npx expo run:ios`)                                                                        | pending     | pending     |
| 2   | Custom scheme, app **not** installed → actionable failure                 | `rndl open exampleexporouter://users/42 --platform ios`                                                                       | **pass 2026-07-07** (`IOS_OPEN_FAILED`, LSApplicationWorkspaceErrorDomain code=115, no-app hint, exit 1)  | pending     | pending     |
| 3   | `https://` URL → opens (Safari/browser without the app)                   | `rndl open https://example.com --platform ios`                                                                                | **pass 2026-07-07** (Safari opened, exit 0)                                                               | pending     | pending     |
| 4   | Route mode `--app-dir` + auto scheme from app.json                        | `rndl open '/users/:id' --app-dir example-expo-router/src/app --params id=42 --platform ios`                                  | **pass 2026-07-07** (built `exampleexporouter://users/42`; then row-2 no-app failure — app not installed) | pending     | pending     |
| 5   | Route mode `--config` (React Navigation), prefix from config              | `rndl open HomeTabs/Feed/Article --config example-react-navigation/src/navigation/linking.ts --params slug=hi --platform ios` | pending (needs app installed to fully open)                                                               | pending     | pending     |
| 6   | Route mode, missing required param → error **before** any device I/O      | `rndl open '/users/:id' --app-dir example-expo-router/src/app --platform ios`                                                 | **pass 2026-07-07** (`OPEN_MISSING_PARAMS`, exit 1, no simctl call)                                       | n/a         | n/a         |
| 7   | `--device` by name / udid / serial                                        | `rndl open https://example.com --platform ios --device "iPhone 17 Pro"`                                                       | **pass 2026-07-07** (opened on the named sim, exit 0)                                                     | pending     | pending     |
| 8   | `--device` unknown → error listing candidates                             | `rndl open https://example.com --platform ios --device "iPhone 99"`                                                           | **pass 2026-07-07** (`DEVICE_NOT_FOUND` + candidate list, exit 1)                                         | pending     | pending     |
| 9   | No booted sim / no attached device → actionable error                     | `rndl open x://y --platform android`                                                                                          | **pass 2026-07-07** (`NO_ANDROID_DEVICE`, exit 1)                                                         | pending     | pending     |
| 10  | Multiple devices (2 booted sims → recency pick + note; 2 Android → error) | (boot 2 sims, or attach 2 devices)                                                                                            | pending (1 sim available)                                                                                 | pending     | pending     |
| 11  | Unauthorized adb device (before accepting USB prompt) → actionable error  | `rndl open x://y --platform android`                                                                                          | n/a                                                                                                       | n/a         | pending     |
| 12  | Omitted `--platform` (auto): one lane available → exit 0 + skip note      | `rndl open https://example.com`                                                                                               | **pass 2026-07-07** (iOS opened; Android skipped note; exit 0)                                            | pending     | pending     |
| 13  | URL with `&`/quotes in query survives the device shell                    | `rndl open "myapp://x?a=1&b=2" --platform android --package com.example`                                                      | n/a                                                                                                       | pending     | pending     |
| 14  | `--device` without an explicit single `--platform` → error                | `rndl open https://example.com --device X`                                                                                    | **pass 2026-07-07** (`DEVICE_FLAG_NEEDS_PLATFORM`, exit 1, no device touched)                             | —           | —           |

## Executed lanes (this session)

The **iOS sim** column rows 2, 3, 4, 6, 7, 8, 9, 12, 14 were executed 2026-07-07
against a booted iPhone 17 Pro (Xcode 26, iOS 26.4). Rows needing the example
app installed on the simulator (1, 5) or a second device (10) and the entire
**Android emu**/**Android USB** columns are **pending** — they need an AVD /
physical hardware and a native build (`npx expo run:ios`/`run:android`) the CI
host and this session lack. Maintainer to run those lanes before release.
