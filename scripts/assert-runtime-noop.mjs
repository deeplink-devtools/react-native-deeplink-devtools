// Asserts @deeplink-devtools/runtime is a no-op in production bundles.
//
// Builds two real production Metro bundles from example-expo-router's
// context (its metro + @expo/metro-config, already installed via Expo):
// a baseline entry and one that additionally imports every public entry of
// the runtime package. The size delta must stay under 1KB — proving Metro's
// dead-code elimination drops the __DEV__-gated implementation entirely.
//
// Zero dependencies; run from the repo root AFTER `yarn build`:
//   node scripts/assert-runtime-noop.mjs

import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_DELTA_BYTES = 1024;
// A production RN bundle is large; anything smaller means the build did not
// actually bundle react-native and the comparison would be meaningless.
const MIN_BASELINE_BYTES = 100_000;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const exampleDir = join(repoRoot, 'example-expo-router');
const exampleRequire = createRequire(join(exampleDir, 'package.json'));

/** Build one production bundle and return its size in bytes. */
async function productionBundleBytes(metro, config, entryFile) {
  const result = await metro.runBuild(config, {
    entry: entryFile,
    dev: false,
    minify: true,
    platform: 'ios',
    sourceMap: false,
  });
  if (typeof result.code !== 'string' || result.code.length === 0) {
    throw new Error(`Metro produced no code for ${entryFile}`);
  }
  return Buffer.byteLength(result.code, 'utf8');
}

async function main() {
  let metro;
  let getDefaultConfig;
  try {
    metro = exampleRequire('metro');
    ({ getDefaultConfig } = exampleRequire('@expo/metro-config'));
  } catch (error) {
    console.error(
      'FAIL could not load metro/@expo/metro-config from example-expo-router —',
      'run `yarn install` first.',
    );
    console.error(String(error));
    process.exit(1);
  }

  // Quiet reporter: CI logs need the verdict, not Metro's progress bars.
  const config = { ...getDefaultConfig(exampleDir), reporter: { update: () => {} } };

  console.log('building production baseline bundle (react-native only)…');
  const baseline = await productionBundleBytes(
    metro,
    config,
    join(exampleDir, 'bundle-assert', 'entry-baseline.js'),
  );
  console.log(`  baseline: ${baseline} bytes`);

  console.log('building production bundle with @deeplink-devtools/runtime imported…');
  const withRuntime = await productionBundleBytes(
    metro,
    config,
    join(exampleDir, 'bundle-assert', 'entry-with-runtime.js'),
  );
  console.log(`  with runtime: ${withRuntime} bytes`);

  if (baseline < MIN_BASELINE_BYTES) {
    console.error(
      `FAIL baseline bundle is implausibly small (${baseline} bytes < ${MIN_BASELINE_BYTES}) — ` +
        'the fixture no longer bundles react-native, so the delta proves nothing.',
    );
    process.exit(1);
  }

  const delta = withRuntime - baseline;
  console.log(`  delta: ${delta} bytes (limit ${MAX_DELTA_BYTES})`);
  if (delta >= MAX_DELTA_BYTES) {
    console.error(
      `FAIL importing @deeplink-devtools/runtime adds ${delta} bytes to a production bundle ` +
        `(limit ${MAX_DELTA_BYTES}). The __DEV__ gate is no longer eliminating the implementation — ` +
        'check that the public entries only reach the implementation via require() inside an if (__DEV__) branch.',
    );
    process.exit(1);
  }
  console.log(`PASS production no-op holds: +${delta} bytes < ${MAX_DELTA_BYTES}.`);
}

main().catch((error) => {
  console.error('FAIL unexpected error during the bundle assertion:');
  console.error(error);
  process.exit(1);
});
