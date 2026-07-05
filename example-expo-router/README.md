# example-expo-router

An [Expo Router](https://docs.expo.dev/router/introduction/) (SDK 57) dev-client app whose `src/app/` directory exercises every file convention the router supports. It doubles as the fixture for `rndl routes` and the adapter's golden-snapshot test.

## Route matrix

| File                                 | URL                       | Convention                             |
| ------------------------------------ | ------------------------- | -------------------------------------- |
| `index.tsx`                          | `/`                       | index route                            |
| `about.tsx` / `contact.tsx`          | `/about`, `/contact`      | static routes                          |
| `(tabs)/home.tsx`                    | `/home`                   | group stripped from URL                |
| `(tabs)/settings/index.tsx`          | `/settings`               | nested index inside a group            |
| `(tabs)/settings/notifications.tsx`  | `/settings/notifications` | nested static route                    |
| `users/[id]/index.tsx`               | `/users/:id`              | dynamic segment as directory           |
| `users/[id]/posts.tsx`               | `/users/:id/posts`        | static child of a dynamic segment      |
| `posts/[...slug].tsx`                | `/posts/*slug`            | catch-all segment                      |
| `(marketing,shop)/promo.tsx`         | `/promo`                  | shared route via array group syntax    |
| `docs/[page].tsx` + `[page].web.tsx` | `/docs/:page`             | platform-specific variant              |
| `+not-found.tsx`                     | any unmatched URL         | not-found route                        |
| `api/users+api.ts`                   | `/api/users`              | API route (server, not navigable)      |
| `_layout.tsx` (×3)                   | —                         | layouts; `unstable_settings` anchoring |
| `+html.tsx`, `+native-intent.tsx`    | —                         | web shell / native intent rewriting    |
| `+middleware.ts`                     | —                         | root server middleware                 |

## Run it

From the repo root: `yarn install`, then:

```sh
cd example-expo-router
yarn start          # or: yarn android / yarn web
```

Deep-link into the dev build with the `exampleexporouter://` scheme, e.g.:

```sh
npx uri-scheme open "exampleexporouter://users/42" --android
```
