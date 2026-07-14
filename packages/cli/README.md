# react-native-deeplink-devtools

The `rndl` command-line tool for React Native deep links: inspect the route table, validate
universal links (AASA) and Android App Links (assetlinks.json), open links on devices, and debug
matches live.

## Install

```sh
npm install --save-dev react-native-deeplink-devtools
# or run without installing:
npx react-native-deeplink-devtools routes
```

Requires Node >= 22.

## Commands

```sh
rndl routes                          # aligned table of every deep-linkable route (--json for machine output)
rndl validate --domain example.com   # check AASA + assetlinks.json (--json / --sarif); exit 1 on errors
rndl open '/users/:id' --params id=42 # build a URL from a route and open it on a running device
rndl interactive                     # pick a route, fire it, watch the live match vs what you fired
rndl typegen --out src/deeplinks.gen.ts # generate typed, tsc-checked deep-link helpers
```

`routes` and `validate` work with both Expo Router (auto-detected `app/` or `src/app/`, or
`--app-dir`) and React Navigation (`--config <module[#export]>`). Linking modules that import
from `'@env'` (react-native-dotenv) need `--dotenv [path]` (default `.env`), available on every
command that accepts `--config`.

Full documentation lives at
[vengalath.com/npm/react-native-deeplink-devtools](https://vengalath.com/npm/react-native-deeplink-devtools/):
every command and flag, the common footguns and their diagnostic codes, and the GitHub Action.
The [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme) has
the short version.

## License

[MIT](LICENSE)
