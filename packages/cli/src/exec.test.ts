import { describe, expect, it } from 'vitest';
import { systemExec } from './exec.js';

// Exercise the real execFile wrapper by spawning this same Node binary — no
// external toolchain needed, works identically on CI (ubuntu) and macOS.
describe('systemExec', () => {
  it('captures stdout and a zero exit code', async () => {
    const result = await systemExec(process.execPath, ['-e', 'process.stdout.write("hi")']);
    expect(result).toMatchObject({ stdout: 'hi', exitCode: 0, notFound: false });
  });

  it('captures a nonzero exit code and stderr', async () => {
    const result = await systemExec(process.execPath, [
      '-e',
      'process.stderr.write("boom"); process.exit(3)',
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('boom');
    expect(result.notFound).toBe(false);
  });

  it('flags a missing binary as notFound', async () => {
    const result = await systemExec('rndl-no-such-binary-xyz', ['--version']);
    expect(result.notFound).toBe(true);
    expect(result.exitCode).toBe(-1);
  });
});
