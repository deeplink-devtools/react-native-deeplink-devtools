# @deeplink-devtools/core

The pure TypeScript core behind [react-native-deeplink-devtools](https://github.com/deeplink-devtools/react-native-deeplink-devtools):
the route-table data model, URL matchers, and the universal-link (AASA) and Android App Links
(assetlinks.json) validators. It has no React Native dependency, so it runs anywhere, including the
CLI and CI.

Most people want the `rndl` CLI, not this package directly. Reach for `core` when you are building
your own tooling on top of the route model or the validators.

## Install

```sh
npm install @deeplink-devtools/core
```

## What is inside

- **Route model:** `RouteTable`, `Route`, `Param`, `Diagnostic`.
- **Validators:** `validateAasa` and `validateAssetlinks`, pure functions over a `FetchedDocument`
  seam (the CLI does the network fetch), plus `toSarif` for a SARIF 2.1.0 report.
- **URL building:** `buildRouteUrl`, `normalizePrefix`.
- **Dev-transport protocol:** `parseReporterMessage` and the reporter message types shared by the
  CLI and the `runtime` package.

Every export is documented with TSDoc. See the [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme)
for the full toolkit.

## License

[MIT](LICENSE)
