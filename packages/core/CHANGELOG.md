# @deeplink-devtools/core

## 0.1.1

### Patch Changes

- 199aca1: `open`, `interactive`, and `typegen` now explain when a dynamic Expo config (`app.config.ts`/`.js`) is why a scheme or Android package cannot be found, instead of failing silently. `validate`'s well-known fetches now time out instead of hanging when a server is unresponsive. Fixed a stray smart-quote character in the AASA CDN caching note.

## 0.1.0

### Minor Changes

- 44f54fa: First public beta. The toolkit is feature complete: route inspection for Expo Router and React
  Navigation, universal link (AASA) and Android App Links validation with a route cross-check,
  opening links on simulators and devices, interactive live-match debugging with the in-app
  reporter, typed deep-link generation, and the GitHub Action.

  The CLI now requires Node 22 or newer.

## 0.0.2

### Patch Changes

- 69facbb: Add a README to each published package so it renders on npm.

## 0.0.1

### Patch Changes

- Reserve the npm package names and @deeplink-devtools scope ahead of the first publish. Bumps all publishable packages from 0.0.0 to 0.0.1 with no functional changes.
