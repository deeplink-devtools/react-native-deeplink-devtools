# rndl deep-link checks (GitHub Action)

Run [`rndl`](https://github.com/deeplink-devtools/react-native-deeplink-devtools) in CI to
catch broken deep links before they ship. The action validates a domain's universal-link
(AASA) and Android App Links (assetlinks.json) files, cross-checks them against your app's
route table, annotates the pull request inline with any findings, and uploads a SARIF report
to GitHub code scanning.

This action is distributed from the monorepo and is not published to npm.

## Usage

```yaml
name: Deep links
on: [pull_request]

permissions:
  contents: read
  security-events: write # required to upload SARIF to code scanning

jobs:
  deeplinks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: deeplink-devtools/react-native-deeplink-devtools/packages/action@v0.1.0
        with:
          domain: example.com
          app-dir: src/app # Expo Router; or use `config:` for React Navigation
          package: com.example.app
```

Node 22+ must be set up before the step, since the action runs the CLI with `npx`.

Leave `domain` empty to run a routes-only check (inspect the route table without fetching any
`.well-known` files). Point `app-dir` or `config` at your app to enable the routes scan and the
AASA route cross-check.

## Inputs

| Input               | Default      | Description                                                                                                                           |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`            | (empty)      | Domain to validate (AASA + assetlinks.json). Empty runs a routes-only check.                                                          |
| `package`           | (empty)      | Expected Android package name. Falls back to `app.json` when omitted.                                                                 |
| `sha256`            | (empty)      | Expected SHA-256 signing-cert fingerprint to look for in assetlinks.json.                                                             |
| `app-dir`           | (empty)      | Expo Router app directory. Enables the routes scan and the AASA route cross-check.                                                    |
| `config`            | (empty)      | React Navigation linking module (`module[#export]`). Enables the routes scan and cross-check.                                         |
| `working-directory` | `.`          | Directory to run `rndl` in.                                                                                                           |
| `version`           | `0.1.0`      | Version of `react-native-deeplink-devtools` to run via `npx` (defaults to the version this copy shipped with, for reproducible runs). |
| `cli-command`       | (empty)      | Advanced: override the `rndl` invocation (e.g. a local build path). Defaults to `npx` of the pinned version.                          |
| `sarif-file`        | `rndl.sarif` | Path (relative to `working-directory`) to write the SARIF report to.                                                                  |
| `upload-sarif`      | `true`       | Upload the SARIF report to GitHub code scanning (needs `security-events: write`).                                                     |
| `fail-on`           | `error`      | Fail the job on `error` (default) or on `warn` (errors and warnings).                                                                 |

## What you get

- **Inline annotations.** Every diagnostic becomes a GitHub annotation on the pull request:
  errors and warnings from the validator, plus informational notes (for example, Apple's AASA
  CDN caching). Each annotation carries the diagnostic code (`AASA_MISSING_ROUTE`,
  `ASSETLINKS_FINGERPRINT_MISMATCH`, and so on) and the concrete fix.
- **A job summary** table of all findings.
- **SARIF in the Security tab** when `upload-sarif` is on and `security-events: write` is granted.
- **A red check** when `fail-on` is met, so a broken universal link stops the merge.

Full action documentation lives at
[vengalath.com/npm/react-native-deeplink-devtools/github-action](https://vengalath.com/npm/react-native-deeplink-devtools/github-action/).

## Verifying against a real domain

The mapping from a failing domain to inline annotations is unit-tested (`annotate.test.mjs`).
To confirm the end-to-end behavior against your own infrastructure, point the action at a domain
whose AASA or assetlinks.json has a known problem and confirm the annotation and SARIF upload land
on the pull request.
