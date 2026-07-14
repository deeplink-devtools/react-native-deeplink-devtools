# @deeplink-devtools/adapter-react-navigation

Builds a [`RouteTable`](https://github.com/deeplink-devtools/react-native-deeplink-devtools/tree/main/packages/core)
from a React Navigation linking configuration. This is the adapter the `rndl` CLI uses for React
Navigation projects; you rarely need it directly.

It executes your linking module under Node with [jiti](https://github.com/unjs/jiti) (TypeScript and
ESM are handled for you) and walks `config.screens`, honoring nested navigators, `path`, `exact`,
`alias`, regex-constrained and optional params, wildcards, and custom `parse`/`stringify` (those
params are reported as `unknown (custom parse)`).

## Install

```sh
npm install @deeplink-devtools/adapter-react-navigation
```

## Usage

```ts
import { scanLinkingModule } from '@deeplink-devtools/adapter-react-navigation';

const { table, diagnostics } = await scanLinkingModule('src/navigation/linking.ts#linking', {
  cwd: process.cwd(),
  dotenvPath: '.env', // optional: back '@env' imports (react-native-dotenv)
});
```

Keep the linking config in an isolated module that only exports plain data and `parse`/`stringify`
functions (react-navigation imports are fine as `import type`), so it can run outside the native
runtime. Modules that import from `'@env'` (react-native-dotenv's virtual module, which only
exists in the Metro/babel build) load when you pass `dotenvPath`: the dotenv file is parsed (no
variable expansion) and its values are served as the `@env` module. The CLI exposes this as
`--dotenv [path]`. Full documentation lives at
[vengalath.com/npm/react-native-deeplink-devtools](https://vengalath.com/npm/react-native-deeplink-devtools/).
See the [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme)
for the full toolkit.

## License

[MIT](LICENSE)
