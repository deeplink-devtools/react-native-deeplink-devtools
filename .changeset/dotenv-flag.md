---
'react-native-deeplink-devtools': minor
'@deeplink-devtools/adapter-react-navigation': minor
---

Add `--dotenv [path]` to every command that accepts `--config` (routes, validate, open, interactive, typegen). Linking modules that import from `'@env'` (react-native-dotenv) previously failed to load with "Cannot find module '@env'"; with the flag, rndl parses the dotenv file (default: `.env`) and serves its values as the `@env` module while loading the config. The adapter's `scanLinkingModule`/`loadLinkingModule` gain a `dotenvPath` option, and a missing dotenv file reports the new `DOTENV_NOT_FOUND` diagnostic.
