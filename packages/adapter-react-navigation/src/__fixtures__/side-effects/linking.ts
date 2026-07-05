/** Loader fixture: a linking module that runs app code at import time. */
import './crash-on-import.js';

export const linking = {
  prefixes: ['fixture://'],
  config: { screens: { Home: 'home' } },
};
