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

Requires Node >= 20.

## Commands

```sh
rndl routes                          # aligned table of every deep-linkable route (--json for machine output)
rndl validate --domain example.com   # check AASA + assetlinks.json (--json / --sarif); exit 1 on errors
rndl open '/users/:id' --params id=42 # build a URL from a route and open it on a running device
rndl interactive                     # pick a route, fire it, watch the live match vs what you fired
```

`routes` and `validate` work with both Expo Router (auto-detected `app/` or `src/app/`, or
`--app-dir`) and React Navigation (`--config <module[#export]>`).

See the [root README](https://github.com/deeplink-devtools/react-native-deeplink-devtools#readme)
for the full reference, [docs/troubleshooting.md](https://github.com/deeplink-devtools/react-native-deeplink-devtools/blob/main/docs/troubleshooting.md)
for the common footguns, and [packages/action](https://github.com/deeplink-devtools/react-native-deeplink-devtools/tree/main/packages/action)
for the GitHub Action.

## License

[MIT](LICENSE)
