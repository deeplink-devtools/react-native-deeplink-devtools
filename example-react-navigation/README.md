# example-react-navigation

A [React Navigation](https://reactnavigation.org) 7 Expo (SDK 57) app whose linking
configuration exercises every linking-config convention. It doubles as the fixture for
`rndl routes --config` and the adapter's golden-snapshot test.

## Route matrix

| Screen                   | URL pattern                       | Convention                                     |
| ------------------------ | --------------------------------- | ---------------------------------------------- |
| `HomeTabs`               | `/`                               | navigator with an empty path                   |
| `HomeTabs/Feed`          | `/feed`                           | nested navigator with a path                   |
| `HomeTabs/Feed/FeedList` | `/feed`                           | empty-path leaf (resolves to the parent path)  |
| `HomeTabs/Feed/Article`  | `/feed/article/:slug/:commentId?` | 3-level nesting, optional param, custom parse  |
| `HomeTabs/Feed/Search`   | `/search`                         | `exact: true` escapes the parent prefix        |
| `HomeTabs/Profile`       | `/user/:id`                       | custom `parse`/`stringify`                     |
| `HomeTabs/Profile`       | `/u/:id`                          | `alias` (extra incoming pattern)               |
| `Promo`                  | `/promo/:code(SUMMER\|WINTER)`    | string shorthand, regex-constrained param      |
| `Settings/Notifications` | `/settings/notifications`         | child of a pathless navigator                  |
| `Settings/DevMenu`       | n/a                               | pathless screen (reachable only by navigate()) |
| `NotFound`               | `/*`                              | wildcard / not-found                           |

## Why `src/navigation/linking.ts` is isolated

`rndl routes --config` executes the linking module under plain Node, so it must not pull
in `react-native` or app components at import time. The module keeps its react-navigation
import type-only and exports nothing but data and `parse`/`stringify` functions. Copy
this pattern into your own app to make its linking config tooling-friendly.

## Run it

From the repo root: `yarn install`, then:

```sh
cd example-react-navigation
yarn start          # or: yarn android / yarn ios
```

Deep-link into the app with the `examplereactnavigation://` scheme, e.g.:

```sh
npx uri-scheme open "examplereactnavigation://feed/article/hello-world/42" --android
```
