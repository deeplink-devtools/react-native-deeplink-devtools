---
"react-native-deeplink-devtools": patch
"@deeplink-devtools/core": patch
---

`open`, `interactive`, and `typegen` now explain when a dynamic Expo config (`app.config.ts`/`.js`) is why a scheme or Android package cannot be found, instead of failing silently. `validate`'s well-known fetches now time out instead of hanging when a server is unresponsive. Fixed a stray smart-quote character in the AASA CDN caching note.
