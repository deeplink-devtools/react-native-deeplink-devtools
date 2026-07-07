# react-native-deeplink-devtools

Deep-link tooling for React Native: inspect your app's route table, validate universal links
(AASA) and Android App Links (assetlinks.json), open links on simulators and devices, and
generate TypeScript types for your deep links.

> **Status:** under active development. Nothing is published to npm yet — watch the repository
> for the first release.

## Usage (early preview)

From an Expo Router project (until the first npm release, via a clone of this repo):

```sh
rndl routes            # aligned table of every deep-linkable route
rndl routes --json     # full scan result: routes, API routes, layouts, diagnostics
rndl routes --app-dir src/app
```

`rndl routes` auto-detects `app/` then `src/app/`, understands every Expo Router file
convention (dynamic segments, catch-alls, groups incl. array syntax, platform-specific
variants, `+not-found`, `+api`, `+html`, `+native-intent`, `+middleware`), and warns —
never crashes — on conventions it doesn't recognize.

From a React Navigation project, point `--config` at the module exporting your
[linking options](https://reactnavigation.org/docs/configuring-links):

```sh
rndl routes --config src/navigation/linking.ts            # default or `linking` export
rndl routes --config src/navigation/linking.ts#myExport   # a specific named export
rndl routes --config src/navigation/linking.ts --json
```

The module is executed under Node (TypeScript and ESM are handled for you), so keep the
linking config in an isolated module that only exports plain data and `parse`/`stringify`
functions — react-navigation imports are fine as `import type`, but importing app code or
`react-native` will fail outside the native runtime (the error tells you exactly this).
Relative imports work; tsconfig `paths` aliases are not resolved. Nested paths, `exact`,
`alias`, regex-constrained and optional params, wildcards, and custom `parse`/`stringify`
are all understood — params with a custom `parse` are reported as `unknown (custom parse)`.

Validate a domain's universal-link and Android App Links files — the checks Apple and
Google actually enforce (HTTPS, no redirects, the 128KB AASA cap, schema, fingerprints):

```sh
rndl validate --domain example.com                 # AASA + assetlinks.json
rndl validate --domain example.com --json          # full result as JSON
rndl validate --domain example.com --sarif         # SARIF 2.1.0 for CI upload
rndl validate --domain example.com --package com.example.app --sha256 AA:BB:...
```

Run inside your app's directory, `validate` also cross-checks the route table (auto-detected
the same way as `rndl routes`; override with `--app-dir`/`--config`, or skip with
`--no-cross-check`): a route no non-excluded AASA component covers is an error
(`AASA_MISSING_ROUTE`), a component matching no route is a warning (`AASA_ORPHAN_PATTERN`).
Errors exit 1, so `rndl validate` in CI stops a broken universal link from shipping. Notes
call out Apple-CDN caching and the `?mode=developer` entitlement.

Open a deep link on a running simulator or device — pass a full URL, or a route name/pattern
that `rndl open` fills in from your route table and app scheme:

```sh
rndl open exampleexporouter://users/42                       # a full URL, opened wherever a device is running
rndl open '/users/:id' --app-dir src/app --params id=42      # build the URL from an Expo Router route
rndl open HomeTabs/Feed/Article --config src/navigation/linking.ts --params slug=hi
rndl open https://example.com/users/42 --platform ios --device "iPhone 17 Pro"
```

With no `--platform`, `open` fires on every platform that has a device (a booted iOS
simulator via `xcrun simctl`, an `adb` device/emulator) and exits 0 if at least one opened —
a platform with no device is a note, not a failure. Naming `--platform ios|android|both`
makes that platform required. Route mode builds the URL from the route pattern and params
(missing required params error before any device is touched), taking the scheme from
`--scheme`, the React Navigation `prefixes`, or your app.json. Still no new npm
dependencies — `open` shells out to `xcrun simctl` and `adb`.

Debug deep links interactively — pick a route, fill in its params, fire it on a device, and
see exactly what your app matched, side by side with what you fired:

```sh
rndl interactive                                    # auto-detects your app; fires wherever a device runs
rndl interactive --platform ios --scheme myapp      # target one platform / scheme explicitly
rndl interactive --config src/navigation/linking.ts # React Navigation linking module
```

Add the in-app reporter to your development build and `rndl interactive` shows the live
match — the route the router resolved and its params — highlighting any mismatch against
what you fired:

```tsx
// Expo Router — app/_layout.tsx
import { useDeepLinkReporter } from '@deeplink-devtools/runtime/expo-router';
useDeepLinkReporter();

// React Navigation — next to your NavigationContainer
import { useDeepLinkReporter } from '@deeplink-devtools/runtime/react-navigation';
useDeepLinkReporter({ navigationRef });
```

The reporter connects to the CLI over a localhost WebSocket (Android is tunneled with an
automatic `adb reverse`). It is **dev-only and a guaranteed no-op in production** — the
implementation sits behind React Native's `__DEV__` flag, so Metro strips it from release
bundles entirely; a CI assertion holds the production cost under 1KB.

The CLI keeps runtime dependencies to a minimum: [commander](https://github.com/tj/commander.js)
(argument parsing, zero transitive dependencies), [ws](https://github.com/websockets/ws)
(the dev-transport WebSocket server for `interactive`, zero transitive dependencies), and
[@clack/prompts](https://github.com/bombshell-dev/clack) (the `interactive` TUI), plus this
repo's own packages. The React Navigation adapter uses [jiti](https://github.com/unjs/jiti)
(zero transitive dependencies) to execute TypeScript/ESM linking modules. `validate` uses
Node's built-in `fetch` — no HTTP dependency. The `runtime` package ships no runtime
dependencies of its own; `react`, `react-native`, and `expo-router` are peer dependencies
(the last optional).

## Packages

| Package                                       | Purpose                                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| `react-native-deeplink-devtools`              | The `rndl` CLI: `routes`, `validate`, `open`, `interactive`   |
| `@deeplink-devtools/core`                     | Route-table model, matchers, validators (pure TS, no RN deps) |
| `@deeplink-devtools/adapter-expo-router`      | Builds a route table from an Expo Router `app/` directory     |
| `@deeplink-devtools/adapter-react-navigation` | Builds a route table from a React Navigation linking config   |
| `@deeplink-devtools/runtime`                  | Tiny in-app reporter for live deep-link debugging (dev-only)  |
| `@deeplink-devtools/typegen`                  | Generates typed route helpers from your route table           |

## Out of scope

Attribution/marketing links (Branch/Adjust territory), push-notification deep links, and
modifying your app's linking configuration. The toolkit inspects and validates; it doesn't
rewrite your app.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
