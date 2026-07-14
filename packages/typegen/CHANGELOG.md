# @deeplink-devtools/typegen

## 0.1.0

### Minor Changes

- 44f54fa: First public beta. The toolkit is feature complete: route inspection for Expo Router and React
  Navigation, universal link (AASA) and Android App Links validation with a route cross-check,
  opening links on simulators and devices, interactive live-match debugging with the in-app
  reporter, typed deep-link generation, and the GitHub Action.

  The CLI now requires Node 22 or newer.

- 90ecd4f: Add `rndl typegen`: generate typed deep links from your route table.

  `rndl typegen --out src/deeplinks.gen.ts` (with `--app-dir` for Expo Router or `--config` for React Navigation) emits a TypeScript module with a compile-time-checked `buildDeepLink(route, params)` that returns a ready-to-open URL (the app scheme is baked in, and can be overridden per call), plus a `useTypedParams<'/route'>()` hook typed for your router. A wrong route or a missing or mistyped param fails `tsc`. Pass `--watch` to regenerate on change. React Navigation params defined with a custom `parse` function are typed `unknown`.

### Patch Changes

- Updated dependencies [44f54fa]
  - @deeplink-devtools/core@0.1.0

## 0.0.2

### Patch Changes

- 69facbb: Add a README to each published package so it renders on npm.
- Updated dependencies [69facbb]
  - @deeplink-devtools/core@0.0.2

## 0.0.1

### Patch Changes

- Reserve the npm package names and @deeplink-devtools scope ahead of the first publish. Bumps all publishable packages from 0.0.0 to 0.0.1 with no functional changes.
- Updated dependencies
  - @deeplink-devtools/core@0.0.1
