# @deeplink-devtools/runtime

The tiny in-app reporter that powers `rndl interactive`. It hooks your app's `Linking` events and
navigation state and streams `{ url, matchedRoute, params }` to the CLI over a localhost dev
transport, so you can see exactly what your app matched against what you fired.

It is **dev-only and a guaranteed no-op in production**: the implementation sits behind React
Native's `__DEV__` flag, so Metro strips it from release bundles entirely. A CI assertion holds the
production cost under 1KB.

## Install

```sh
npm install --save-dev @deeplink-devtools/runtime
```

`react` and `react-native` are peer dependencies; `expo-router` is an optional peer (only needed for
the Expo Router entry point).

## Usage

Pick the entry point for your router:

```tsx
// Expo Router: app/_layout.tsx
import { useDeepLinkReporter } from '@deeplink-devtools/runtime/expo-router';
useDeepLinkReporter();

// React Navigation: next to your NavigationContainer
import { useDeepLinkReporter } from '@deeplink-devtools/runtime/react-navigation';
useDeepLinkReporter({ navigationRef });
```

The reporter connects to `rndl interactive` on a localhost WebSocket (Android is tunneled with an
automatic `adb reverse`). Both hooks accept transport options: `port` (defaults to 7635, match
`rndl interactive --port <n>`) and `host` (defaults to `localhost`).

## Custom routers: `createReporter`

If you are integrating a router the ready-made hooks do not cover, the main entry exports the
low-level client:

```ts
import { createReporter } from '@deeplink-devtools/runtime';

const reporter = createReporter({ router: 'my-router' });
reporter.report({ url, matchedRoute, params, ts: Date.now() });
reporter.close();
```

`createReporter` takes the same transport options plus `router`, `appName`, and `platform`
(announced to the CLI), and follows the same rules as the hooks: fire-and-forget reporting, brief
buffering while disconnected, silent failures, and an inert stub in production builds.

Full documentation lives at
[vengalath.com/npm/react-native-deeplink-devtools/runtime-reporter](https://vengalath.com/npm/react-native-deeplink-devtools/runtime-reporter/).
See the [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme)
for the full workflow.

## License

[MIT](LICENSE)
