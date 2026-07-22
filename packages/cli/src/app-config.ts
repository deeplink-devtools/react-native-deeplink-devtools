import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The fields rndl reads from an Expo `app.json`. Best-effort; both may be absent. */
export interface AppConfig {
  /** `expo.scheme`; the first entry when it is declared as an array. */
  scheme?: string;
  /** `expo.android.package`. */
  androidPackage?: string;
}

/**
 * Read the Expo `app.json` next to `cwd` and extract the deep-link scheme and
 * Android package. Best-effort and never throws: a missing or malformed file,
 * or absent fields, yields an empty object. Note that `app.config.js`/`.ts`
 * are not evaluated - only a static `app.json` is read.
 */
export function readAppConfig(cwd: string): AppConfig {
  const appJson = join(cwd, 'app.json');
  if (!existsSync(appJson)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(appJson, 'utf8')) as {
      expo?: { scheme?: string | string[]; android?: { package?: string } };
    };
    const rawScheme = parsed.expo?.scheme;
    const scheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;
    const androidPackage = parsed.expo?.android?.package;
    return {
      ...(scheme !== undefined ? { scheme } : {}),
      ...(androidPackage !== undefined ? { androidPackage } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Like {@link readAppConfig}, but walks up from `startDir` to find the nearest
 * `app.json` - useful when the route source is a nested `--app-dir` (e.g.
 * `src/app`) whose Expo config lives one or two directories above it. Returns
 * an empty object if none is found before the filesystem root.
 */
export function findAppConfig(startDir: string): AppConfig {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'app.json'))) {
      return readAppConfig(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return {};
    }
    dir = parent;
  }
}

/** Dynamic Expo config file names rndl detects but does not evaluate. */
const DYNAMIC_CONFIG_FILES = ['app.config.ts', 'app.config.js', 'app.config.mjs', 'app.config.cjs'];

/**
 * Walk up from `startDir` looking for a dynamic Expo config
 * (`app.config.ts`/`.js`/`.mjs`/`.cjs`). rndl reads only a static `app.json`,
 * so a project whose scheme or Android package lives in a dynamic config is
 * invisible to auto-detection; finding one lets callers point the user at the
 * real cause instead of failing silently. Returns the file path (forward
 * slashes) when found, else `undefined`.
 */
export function findDynamicConfig(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    for (const name of DYNAMIC_CONFIG_FILES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate.replaceAll('\\', '/');
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
