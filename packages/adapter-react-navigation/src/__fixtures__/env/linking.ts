/**
 * Loader fixture: a linking config built from react-native-dotenv's `@env`
 * virtual module, the shape that fails to load without a dotenv backing.
 * NOT_SET is missing from fixture.env on purpose (allowUndefined semantics).
 */
import { DEEP_LINK_DOMAIN, NOT_SET, SCHEME } from '@env';

export const linking = {
  prefixes: [
    `${SCHEME}://`,
    `https://${DEEP_LINK_DOMAIN}`,
    ...(NOT_SET === undefined ? [] : [NOT_SET]),
  ],
  config: { screens: { Home: 'home' } },
};
