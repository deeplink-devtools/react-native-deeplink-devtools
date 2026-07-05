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

The CLI keeps runtime dependencies to a minimum: [commander](https://github.com/tj/commander.js)
(argument parsing, zero transitive dependencies) plus this repo's own packages.

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
