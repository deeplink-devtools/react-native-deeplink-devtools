# @deeplink-devtools/typegen

Typed deep links for React Native, generated from your route table.

This package is the code generator behind `rndl typegen`. Most people never import it directly:
they run the CLI, which uses it to write a TypeScript module into their app. It works with both
Expo Router and React Navigation.

## Usage

Run the generator from the [`rndl`](https://github.com/deeplink-devtools/react-native-deeplink-devtools/tree/main/packages/cli)
CLI (no need to install this package):

```bash
# Expo Router
npx rndl typegen --out src/deeplinks.gen.ts --app-dir src/app

# React Navigation
npx rndl typegen --out src/deeplinks.gen.ts --config src/navigation/linking.ts#linking
```

Pass `--watch` to regenerate whenever your routes change, and `--scheme myapp` to override the
scheme baked into the output (by default it is read from `app.json` or your linking `prefixes`).

The generated module has no default export and imports its small runtime from
`@deeplink-devtools/core`, so add that as a dependency of your app:

```bash
npm install @deeplink-devtools/core
```

## What you get

Given a route like `/users/[id]` (Expo Router) or `/users/:id` (React Navigation), the generated
file exports:

```ts
import { buildDeepLink, useTypedParams } from './deeplinks.gen';

// Build a link. The route and its params are checked at compile time.
const url = buildDeepLink('/users/[id]', { id: '42' });
// => 'myapp://users/42'

// Override the baked-in scheme when you need a universal link.
const web = buildDeepLink('/users/[id]', { id: '42' }, 'https://example.com');
// => 'https://example.com/users/42'

// Read the current screen's params, typed for the route.
const { id } = useTypedParams<'/users/[id]'>();
```

A wrong route key, a missing required param, or a mistyped param value fails `tsc`, so a broken
deep link is caught before it ships.

- Route keys are router-native: Expo Router uses the bracket form you author (`/users/[id]`,
  `/posts/[...slug]`); React Navigation keeps its colon patterns (`/users/:id`).
- Catch-all params are one `a/b/c` string when you build a link, and a `string[]` when you read
  them back (matching what the router returns).
- React Navigation params defined with a custom `parse` function are typed `unknown`, since their
  runtime type is not knowable from the config.

## API

If you are building your own tooling, the package exports a pure generator:

```ts
import { generateDeepLinkTypes } from '@deeplink-devtools/typegen';
import type { RouteTable } from '@deeplink-devtools/core';

const source: string = generateDeepLinkTypes(routeTable, { defaultPrefix: 'myapp://' });
```

See the [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme)
for the rest of the toolkit.

## License

[MIT](LICENSE)
