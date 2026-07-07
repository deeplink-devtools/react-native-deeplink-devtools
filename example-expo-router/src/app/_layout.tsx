import { useDeepLinkReporter } from '@deeplink-devtools/runtime/expo-router';
import { Stack } from 'expo-router';

export default function RootLayout() {
  useDeepLinkReporter();
  return <Stack />;
}
