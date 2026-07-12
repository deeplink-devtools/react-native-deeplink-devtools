import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * The app's deep-link configuration, kept in an isolated module on purpose:
 * it has no runtime imports (the react-navigation import above is type-only),
 * so tools like `rndl routes --config` can execute it under plain Node without
 * pulling in react-native. Keep it that way - export only plain data plus
 * parse/stringify functions.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['examplereactnavigation://', 'https://deeplink-devtools.example.com'],
  config: {
    screens: {
      HomeTabs: {
        path: '',
        screens: {
          Feed: {
            path: 'feed',
            initialRouteName: 'FeedList',
            screens: {
              FeedList: '',
              Article: {
                path: 'article/:slug/:commentId?',
                parse: { commentId: Number },
                stringify: { commentId: (id: number) => String(id) },
              },
              Search: { path: 'search', exact: true },
            },
          },
          Profile: {
            path: 'user/:id',
            alias: ['u/:id'],
            parse: { id: (id: string) => id.replace(/^@/, '') },
            stringify: { id: (id: string) => `@${id}` },
          },
        },
      },
      Promo: 'promo/:code(SUMMER|WINTER)',
      Settings: {
        screens: {
          Notifications: 'settings/notifications',
          DevMenu: {},
        },
      },
      NotFound: '*',
    },
  },
};
