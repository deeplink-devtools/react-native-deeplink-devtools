# @deeplink-devtools/adapter-expo-router

Builds a [`RouteTable`](https://github.com/deeplink-devtools/react-native-deeplink-devtools/tree/main/packages/core)
from an Expo Router `app/` directory. This is the adapter the `rndl` CLI uses for Expo Router
projects; you rarely need it directly.

It understands every Expo Router file convention (dynamic segments, catch-alls, groups including
array syntax, platform-specific variants, `+not-found`, `+api`, `+html`, `+native-intent`,
`+middleware`) and warns, never crashes, on conventions it does not recognize.

## Install

```sh
npm install @deeplink-devtools/adapter-expo-router
```

## Usage

```ts
import { buildRouteTable } from '@deeplink-devtools/adapter-expo-router';

const { table, diagnostics } = buildRouteTable('src/app');
```

See the [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme)
for the full toolkit.

## License

[MIT](LICENSE)
