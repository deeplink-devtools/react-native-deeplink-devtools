# react-native-deeplink-devtools

Deep-link tooling for React Native: inspect your app's route table, validate universal links
(AASA) and Android App Links (assetlinks.json), open links on simulators and devices, debug
matches live, and generate TypeScript types for your deep links.

<!-- Demo GIF (rndl interactive: pick a route, fill params, fire, see the live match) goes here, above the fold. -->

> **Status:** pre-1.0 and under active development; interfaces may still change. Early `0.0.x`
> packages are on npm to hold the names. To try the full toolkit today, run the CLI from a clone
> of this repo (see the quickstart).

<p align="center"><img width="1330" alt=“rndl demo" src="https://dl.vengalath.com/rndl/deeplink-devtools-demo.gif" /></p>

## Why

Deep linking is one of the most error-prone parts of a React Native app, and the failures are
silent: a universal link that opens Safari instead of your app, an AASA file behind a redirect,
an `assetlinks.json` with the wrong fingerprint, a route that no `applinks` component covers. None
of that shows up until a user taps a link in production. `rndl` turns those footguns into a check
you run locally and in CI, so you never ship a broken link again.

## 30-second quickstart

```sh
git clone https://github.com/deeplink-devtools/react-native-deeplink-devtools
cd react-native-deeplink-devtools && yarn install && yarn build

# from your app directory (or point --app-dir / --config at it):
node <path-to-clone>/packages/cli/dist/cli.js routes
node <path-to-clone>/packages/cli/dist/cli.js validate --domain example.com
```

Once installed as the `rndl` bin, the commands read `rndl routes`, `rndl validate`, and so on.

```sh
rndl routes                          # aligned table of every deep-linkable route
rndl validate --domain example.com   # check AASA + assetlinks.json, exit 1 on errors
rndl open '/users/:id' --params id=42 # build the URL and open it on a running device
rndl interactive                     # pick a route, fire it, watch the live match
```

In CI, the [GitHub Action](packages/action) wraps `rndl validate` and `rndl routes`, annotates the
pull request inline, and uploads SARIF to code scanning.

## API reference

### `rndl routes`

Prints the deep-linkable route table. Auto-detects `app/` then `src/app/` for Expo Router, or
point `--config` at a React Navigation linking module.

```sh
rndl routes --json                                  # routes, API routes, layouts, diagnostics
rndl routes --app-dir src/app                        # explicit Expo Router directory
rndl routes --config src/navigation/linking.ts       # default or `linking` export
rndl routes --config src/navigation/linking.ts#named # a specific named export
```

For Expo Router it understands every file convention (dynamic segments, catch-alls, groups
including array syntax, platform-specific variants, `+not-found`, `+api`, `+html`,
`+native-intent`, `+middleware`) and warns, never crashes, on conventions it does not recognize.
For React Navigation it executes the linking module under Node (TypeScript and ESM are handled for
you), so keep the linking config in an isolated module that only exports plain data and
`parse`/`stringify` functions. Nested paths, `exact`, `alias`, regex-constrained and optional
params, wildcards, and custom `parse`/`stringify` are all understood; params with a custom `parse`
are reported as `unknown (custom parse)`.

### `rndl validate --domain <domain>`

Validates a domain's universal-link and Android App Links files against the checks Apple and
Google actually enforce: HTTPS, no redirects, the 128KB AASA cap, JSON schema, and fingerprints.

```sh
rndl validate --domain example.com                 # AASA + assetlinks.json
rndl validate --domain example.com --json          # full result as JSON
rndl validate --domain example.com --sarif         # SARIF 2.1.0 for CI upload
rndl validate --domain example.com --package com.example.app --sha256 AA:BB:...
```

Run inside your app's directory and `validate` also cross-checks the route table (auto-detected
like `rndl routes`; override with `--app-dir`/`--config`, or skip with `--no-cross-check`): a route
no non-excluded AASA component covers is an error (`AASA_MISSING_ROUTE`), a component matching no
route is a warning (`AASA_ORPHAN_PATTERN`). Errors exit 1, so `rndl validate` in CI stops a broken
universal link from shipping. Notes call out Apple-CDN caching and the `?mode=developer`
entitlement. See [docs/troubleshooting.md](docs/troubleshooting.md) for the top footguns and the
diagnostic code that catches each one.

### `rndl open <url | route>`

Opens a deep link on a running simulator or device. Pass a full URL, or a route name/pattern that
`rndl open` fills in from your route table and app scheme.

```sh
rndl open exampleexporouter://users/42                      # a full URL, wherever a device runs
rndl open '/users/:id' --app-dir src/app --params id=42     # build the URL from an Expo Router route
rndl open HomeTabs/Feed/Article --config src/navigation/linking.ts --params slug=hi
rndl open https://example.com/users/42 --platform ios --device "iPhone 17 Pro"
```

With no `--platform`, `open` fires on every platform that has a device (a booted iOS simulator via
`xcrun simctl`, an `adb` device or emulator) and exits 0 if at least one opened; a platform with no
device is a note, not a failure. Naming `--platform ios|android|both` makes that platform required.
Route mode builds the URL from the route pattern and params (missing required params error before
any device is touched), taking the scheme from `--scheme`, the React Navigation `prefixes`, or your
app.json.

### `rndl interactive` and the in-app reporter

Debug deep links interactively: pick a route, fill in its params, fire it on a device, and see
exactly what your app matched, side by side with what you fired.

```sh
rndl interactive                                    # auto-detects your app; fires wherever a device runs
rndl interactive --platform ios --scheme myapp      # target one platform / scheme explicitly
rndl interactive --config src/navigation/linking.ts # React Navigation linking module
```

Add the in-app reporter to your development build and `rndl interactive` shows the live match (the
route the router resolved and its params), highlighting any mismatch against what you fired:

```tsx
// Expo Router: app/_layout.tsx
import { useDeepLinkReporter } from '@deeplink-devtools/runtime/expo-router';
useDeepLinkReporter();

// React Navigation: next to your NavigationContainer
import { useDeepLinkReporter } from '@deeplink-devtools/runtime/react-navigation';
useDeepLinkReporter({ navigationRef });
```

The reporter connects to the CLI over a localhost WebSocket (Android is tunneled with an automatic
`adb reverse`). It is **dev-only and a guaranteed no-op in production**: the implementation sits
behind React Native's `__DEV__` flag, so Metro strips it from release bundles entirely, and a CI
assertion holds the production cost under 1KB.

### Dependencies

The CLI keeps runtime dependencies to a minimum: [commander](https://github.com/tj/commander.js)
(argument parsing, zero transitive dependencies), [ws](https://github.com/websockets/ws) (the
dev-transport WebSocket server for `interactive`, zero transitive dependencies), and
[@clack/prompts](https://github.com/bombshell-dev/clack) (the `interactive` TUI), plus this repo's
own packages. The React Navigation adapter uses [jiti](https://github.com/unjs/jiti) (zero
transitive dependencies) to execute TypeScript/ESM linking modules. `validate` uses Node's built-in
`fetch`, so there is no HTTP dependency. The `runtime` package ships no runtime dependencies of its
own; `react`, `react-native`, and `expo-router` are peer dependencies (the last optional).

## Compatibility

| Area         | Supported                                                            |
| ------------ | -------------------------------------------------------------------- |
| React Native | >= 0.76, New Architecture (bridgeless) only                          |
| Platforms    | iOS (simulator via `simctl`) and Android (device/emulator via `adb`) |
| Routers      | Expo Router and React Navigation 7+                                  |
| Expo         | Expo-compatible; example apps are Expo dev-client apps               |
| Node (CLI)   | >= 20                                                                |

## Compared to the alternatives

| Task                                    | rndl          | `npx uri-scheme` | Manual (curl + editor) | Attribution SDKs (Branch, Adjust) |
| --------------------------------------- | ------------- | ---------------- | ---------------------- | --------------------------------- |
| Print the app's deep-link route table   | yes           | no               | no                     | no                                |
| Validate AASA / assetlinks.json in CI   | yes           | no               | partial (by hand)      | no                                |
| Cross-check routes against AASA         | yes           | no               | no                     | no                                |
| Open a link on a device                 | yes           | yes              | yes (`xcrun`/`adb`)    | no                                |
| Live match debugging (fired vs matched) | yes           | no               | no                     | no                                |
| Typed deep links (`tsc`-checked)        | yes (planned) | no               | no                     | no                                |
| Attribution / marketing links           | no            | no               | no                     | yes                               |

`rndl` is developer tooling for testing and validating the links your app already declares. It is
not an attribution platform, and it does not modify your linking configuration.

## Packages

| Package                                       | Purpose                                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| `react-native-deeplink-devtools`              | The `rndl` CLI: `routes`, `validate`, `open`, `interactive`   |
| `@deeplink-devtools/core`                     | Route-table model, matchers, validators (pure TS, no RN deps) |
| `@deeplink-devtools/adapter-expo-router`      | Builds a route table from an Expo Router `app/` directory     |
| `@deeplink-devtools/adapter-react-navigation` | Builds a route table from a React Navigation linking config   |
| `@deeplink-devtools/runtime`                  | Tiny in-app reporter for live deep-link debugging (dev-only)  |
| `@deeplink-devtools/typegen`                  | Generates typed route helpers from your route table (planned) |

## Out of scope

Attribution/marketing links (Branch/Adjust territory), push-notification deep links, and modifying
your app's linking configuration. The toolkit inspects and validates; it does not rewrite your app.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
