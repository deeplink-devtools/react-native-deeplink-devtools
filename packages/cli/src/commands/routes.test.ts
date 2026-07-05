import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAppDir, runRoutes } from './routes.js';

const EXAMPLE_APP_DIR = fileURLToPath(
  new URL('../../../../example-expo-router/src/app', import.meta.url),
);

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir !== undefined) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('resolveAppDir', () => {
  it('prefers an explicit --app-dir, resolved against cwd', () => {
    expect(resolveAppDir('/project', 'custom/app')).toBe(resolve('/project', 'custom/app'));
  });

  it('falls back to app/ then src/app/', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'rndl-cli-'));
    expect(resolveAppDir(tempDir)).toBeUndefined();
    mkdirSync(join(tempDir, 'src', 'app'), { recursive: true });
    expect(resolveAppDir(tempDir)).toBe(join(tempDir, 'src', 'app'));
    mkdirSync(join(tempDir, 'app'));
    expect(resolveAppDir(tempDir)).toBe(join(tempDir, 'app'));
  });
});

describe('runRoutes', () => {
  it('errors actionably when no app directory was found', () => {
    const output = runRoutes(undefined, { json: false, color: false });
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('APP_DIR_NOT_FOUND');
    expect(output.stderr).toContain('--app-dir');
  });

  it('exits 1 with diagnostics when the app directory does not exist', () => {
    const output = runRoutes(join(tmpdir(), 'rndl-cli-missing'), { json: false, color: false });
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('APP_DIR_NOT_FOUND');
  });

  it('prints an aligned table for the example app', () => {
    const output = runRoutes(EXAMPLE_APP_DIR, { json: false, color: false });
    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe('');
    expect(output.stdout).toContain('PATTERN');
    expect(output.stdout).toContain('/users/:id');
    expect(output.stdout).toContain('/posts/*slug');
    expect(output.stdout).toContain('12 routes (expo-router), 1 API route, 3 layouts');
    // No ANSI codes when color is off.
    expect(output.stdout).not.toContain(String.fromCharCode(27));
  });

  it('emits the full scan result as stable JSON', () => {
    const output = runRoutes(EXAMPLE_APP_DIR, { json: true, color: false });
    expect(output.exitCode).toBe(0);
    const parsed = JSON.parse(output.stdout) as {
      table: { sourceType: string; routes: unknown[] };
      apiRoutes: string[];
    };
    expect(parsed.table.sourceType).toBe('expo-router');
    expect(parsed.table.routes).toHaveLength(12);
    expect(parsed.apiRoutes).toEqual(['api/users+api.ts']);
    expect(parsed).toMatchSnapshot();
  });

  it('colors patterns and diagnostics only when asked', () => {
    const colored = runRoutes(EXAMPLE_APP_DIR, { json: false, color: true });
    expect(colored.stdout).toContain(String.fromCharCode(27));
  });
});
