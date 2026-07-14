# @deeplink-devtools/adapter-react-navigation

## 0.1.0

### Minor Changes

- c538db9: Add `--dotenv [path]` to every command that accepts `--config` (routes, validate, open, interactive, typegen). Linking modules that import from `'@env'` (react-native-dotenv) previously failed to load with "Cannot find module '@env'"; with the flag, rndl parses the dotenv file (default: `.env`) and serves its values as the `@env` module while loading the config. The adapter's `scanLinkingModule`/`loadLinkingModule` gain a `dotenvPath` option, and a missing dotenv file reports the new `DOTENV_NOT_FOUND` diagnostic.
- 44f54fa: First public beta. The toolkit is feature complete: route inspection for Expo Router and React
  Navigation, universal link (AASA) and Android App Links validation with a route cross-check,
  opening links on simulators and devices, interactive live-match debugging with the in-app
  reporter, typed deep-link generation, and the GitHub Action.

  The CLI now requires Node 22 or newer.

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
