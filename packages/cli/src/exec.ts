import { execFile } from 'node:child_process';

/** The result of running an external tool. Never conveyed as a thrown error. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  /** Exit code; `-1` when the process never ran or was killed (missing binary, timeout). */
  exitCode: number;
  /** `true` when the executable itself was not found (ENOENT) — the toolchain is not installed. */
  notFound: boolean;
}

/**
 * Runs a binary with an argument list and no shell, resolving to an
 * {@link ExecResult}. This is the seam `rndl open` injects so device discovery
 * and link-opening can be unit-tested without a real toolchain.
 */
export type ExecFn = (file: string, args: string[]) => Promise<ExecResult>;

/** Hard cap on a child process; `adb shell am start -W` can otherwise block forever. */
const TIMEOUT_MS = 30_000;

/** Real {@link ExecFn} over `node:child_process`. Never rejects. */
export const systemExec: ExecFn = (file, args) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr, exitCode: 0, notFound: false });
          return;
        }
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          resolve({ stdout, stderr, exitCode: -1, notFound: true });
          return;
        }
        // `error.code` is the numeric exit status when the process ran and failed;
        // a signal (timeout kill) leaves it non-numeric, which we map to -1.
        const exitCode = typeof error.code === 'number' ? error.code : -1;
        const killedNote = error.killed === true ? `process timed out after ${TIMEOUT_MS}ms\n` : '';
        resolve({ stdout, stderr: `${killedNote}${stderr}`, exitCode, notFound: false });
      },
    );
  });
