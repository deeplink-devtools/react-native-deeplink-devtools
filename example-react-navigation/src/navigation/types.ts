import type { NavigatorScreenParams } from '@react-navigation/native';

/** Params of the feed stack, nested inside the Feed tab. */
export type FeedStackParamList = {
  FeedList: undefined;
  Article: { slug: string; commentId?: number };
  Search: undefined;
};

/** Params of the bottom-tab navigator behind the HomeTabs root screen. */
export type HomeTabsParamList = {
  Feed: NavigatorScreenParams<FeedStackParamList>;
  Profile: { id: string };
};

/** Params of the settings stack — intentionally unreachable via URL. */
export type SettingsStackParamList = {
  Notifications: undefined;
  DevMenu: undefined;
};

/** Params of the root stack navigator. */
export type RootStackParamList = {
  HomeTabs: NavigatorScreenParams<HomeTabsParamList>;
  Promo: { code: string };
  Settings: NavigatorScreenParams<SettingsStackParamList>;
  NotFound: undefined;
};
