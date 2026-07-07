// Same as entry-baseline.js plus every public entry of
// @deeplink-devtools/runtime, referenced the way a real app would. In a
// production build the reporter implementation must be dead-code-eliminated,
// keeping the size delta against the baseline under 1KB.
import { Linking } from 'react-native';
import { createReporter } from '@deeplink-devtools/runtime';
import { useDeepLinkReporter as useExpoRouterReporter } from '@deeplink-devtools/runtime/expo-router';
import { useDeepLinkReporter as useReactNavigationReporter } from '@deeplink-devtools/runtime/react-navigation';

export const refs = [
  Linking.getInitialURL,
  createReporter,
  useExpoRouterReporter,
  useReactNavigationReporter,
];
