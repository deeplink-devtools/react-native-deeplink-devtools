---
'@deeplink-devtools/typegen': minor
'react-native-deeplink-devtools': minor
---

Add `rndl typegen`: generate typed deep links from your route table.

`rndl typegen --out src/deeplinks.gen.ts` (with `--app-dir` for Expo Router or `--config` for React Navigation) emits a TypeScript module with a compile-time-checked `buildDeepLink(route, params)` that returns a ready-to-open URL (the app scheme is baked in, and can be overridden per call), plus a `useTypedParams<'/route'>()` hook typed for your router. A wrong route or a missing or mistyped param fails `tsc`. Pass `--watch` to regenerate on change. React Navigation params defined with a custom `parse` function are typed `unknown`.
