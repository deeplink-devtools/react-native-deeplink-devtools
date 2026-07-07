// Baseline entry for the production no-op assertion: everything a minimal
// React Native app pulls in, minus the runtime package. The delta between
// this bundle and entry-with-runtime.js is what importing
// @deeplink-devtools/runtime costs a production build.
import { Linking } from 'react-native';

export const refs = [Linking.getInitialURL];
