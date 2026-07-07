# @deeplink-devtools/typegen

Typed deep links for React Native, generated from your route table.

> **Status:** planned. This package is a placeholder that currently re-exports the `RouteTable`
> types from [`@deeplink-devtools/core`](https://github.com/deeplink-devtools/react-native-deeplink-devtools/tree/main/packages/core).
> The generator ships in an upcoming release.

When it lands, `rndl typegen --out src/deeplinks.gen.ts` will emit a typed route map, a
compile-time-checked `buildDeepLink(route, params)` helper, and `useTypedParams` wrappers for both
Expo Router and React Navigation, so a wrong route or param fails `tsc`.

See the [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme)
for the rest of the toolkit.

## License

[MIT](LICENSE)
