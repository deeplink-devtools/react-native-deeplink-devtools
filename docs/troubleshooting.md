# Deep-link troubleshooting

The ten most common ways universal links and Android App Links break, what causes each one, and how
to fix it. Where `rndl validate` catches the problem, the diagnostic code is listed so you can find
it in the output. A few footguns live in your app's native config (entitlements, the manifest);
`rndl` validates the domain side and the route table, so those are flagged here as manual checks.

Prefer the long-form version? The deep dive
[Why universal links and Android App Links break](https://vengalath.com/blog/why-universal-links-and-android-app-links-break/)
walks through the same ten failures with the platform behavior behind each one.

## 1. The AASA file is behind a redirect

**Symptom:** the link opens Safari, not your app, even though the file looks correct.
**Cause:** Apple fetches `apple-app-site-association` with redirects disabled. A `301`/`302` (often
an apex-to-`www` redirect, or an auth wall) means Apple sees no file at all.
**Fix:** serve the file with a `200` at the exact URL, no redirect. Check both the apex and any `www`
host you advertise.
**rndl:** `AASA_REDIRECTED` (error). The assetlinks equivalent is `ASSETLINKS_REDIRECTED`.

## 2. The AASA file is not reachable over plain HTTPS

**Symptom:** validation cannot fetch the file.
**Cause:** it is served over HTTP, blocked by auth, or missing. The file must live at
`https://<domain>/.well-known/apple-app-site-association` (no `.json` extension) and return `200`.
**Fix:** put it under `/.well-known/`, HTTPS, publicly reachable, no extension.
**rndl:** `AASA_NOT_HTTPS`, `AASA_FETCH_FAILED`.

## 3. The AASA file has the wrong Content-Type

**Symptom:** iOS ignores an otherwise valid file.
**Cause:** it is served as `text/html` or `text/plain`. Apple expects `application/json` (and does
not require, but tolerates, the file having no extension).
**Fix:** serve `apple-app-site-association` as `application/json`.
**rndl:** `AASA_CONTENT_TYPE` (warning).

## 4. The AASA file is too large

**Symptom:** iOS silently drops your associations.
**Cause:** the file exceeds Apple's 128KB limit, usually from thousands of `components`.
**Fix:** collapse patterns; prefer a small number of wildcarded components over one per route.
**rndl:** `AASA_TOO_LARGE` (error).

## 5. The appID (Team ID + bundle ID) is missing or wrong

**Symptom:** links do not open even though the domain resolves.
**Cause:** `applinks.details[].appIDs` (or the legacy `appID`) must be `<TeamID>.<BundleID>`. A typo,
a wildcard, or the wrong team breaks the association.
**Fix:** use the exact `TEAMID.com.your.bundle`. Find the Team ID in your Apple Developer account.
**rndl:** `AASA_MISSING_APPID`, `AASA_INVALID_APPID`.

## 6. A route is not covered by any component (or a component covers nothing)

**Symptom:** some links open the app but land on the wrong screen, or a marketing path never opens
the app at all.
**Cause:** the `components` in your AASA do not line up with the routes your app actually declares.
**Fix:** run the cross-check from your app directory so `rndl` compares the two. Add a component for
every route you want to be a universal link, and remove components that match nothing.
**rndl:** `AASA_MISSING_ROUTE` (error), `AASA_ORPHAN_PATTERN` (warning). Needs `--app-dir`/`--config`
(auto-detected in an app directory).

## 7. The iOS entitlement is missing the `applinks:` prefix

**Symptom:** everything on the server is correct, but links still open Safari.
**Cause:** the Associated Domains entitlement entry must read `applinks:example.com`, not
`example.com`. This lives in your app (Xcode Signing and Capabilities, or `app.json`
`ios.associatedDomains`), so the server-side file cannot reveal it.
**Fix:** add `applinks:<domain>` for every host, rebuild, and reinstall. `?mode=developer` on the
entitlement bypasses Apple's CDN cache while testing.
**rndl:** not detected (app-side). Check your entitlements or `app.json`.

## 8. The Android signing fingerprint does not match

**Symptom:** App Links verify on a debug build but fail after release (or vice versa).
**Cause:** `assetlinks.json` lists a `sha256_cert_fingerprints` value from a different keystore than
the installed build. Debug and release (and Play App Signing) each have their own fingerprint.
**Fix:** include every fingerprint you ship with, including Google Play's app-signing certificate.
Pass `--sha256 <fingerprint>` to confirm a specific one is present.
**rndl:** `ASSETLINKS_FINGERPRINT_MISMATCH`, `ASSETLINKS_INVALID_FINGERPRINT`,
`ASSETLINKS_NO_FINGERPRINTS`.

## 9. The Android package name or relation is wrong

**Symptom:** Android never verifies the domain.
**Cause:** `assetlinks.json` has the wrong `package_name`, or its `relation` is not
`delegate_permission/common.handle_all_urls`.
**Fix:** set `package_name` to your applicationId and use the exact relation string. Pass
`--package <name>` (or let `rndl` read it from `app.json`) to check it.
**rndl:** `ASSETLINKS_PACKAGE_MISMATCH`, `ASSETLINKS_PACKAGE_MISSING`,
`ASSETLINKS_NO_HANDLE_ALL_URLS`, `ASSETLINKS_INVALID_RELATION`.

## 10. The Android manifest is missing `autoVerify` or the right intent filter

**Symptom:** `assetlinks.json` is perfect, but tapping a link shows the app chooser instead of
opening your app directly.
**Cause:** the `<intent-filter>` for your `https` host needs `android:autoVerify="true"`, plus the
`VIEW` action, `BROWSABLE` category, and matching `scheme`/`host` data. This lives in your
`AndroidManifest.xml` (or `app.json` `android.intentFilters`), not on the server.
**Fix:** add `autoVerify` and the intent filter, rebuild, and verify with
`adb shell pm get-app-links <package>`.
**rndl:** not detected (app-side). Check your manifest or `app.json`.

## A note on caching and propagation

Apple serves AASA through a CDN, so changes can take 24 hours or more to reach devices (a
first-time fetch can take days); use
`?mode=developer` on the entitlement while testing, and reinstall the app to force a re-fetch.
Android re-verifies App Links on install and on update. `rndl validate` surfaces the caching note in
its output and never treats a fresh change as a hard failure.
