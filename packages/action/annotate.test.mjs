import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  annotationsFor,
  countsFor,
  main,
  summaryMarkdown,
  toWorkflowCommand,
} from './annotate.mjs';

/** A seeded-bad validate result: one error (with a fix), one warning, one note. */
const seededBad = {
  domain: 'example.com',
  diagnostics: [
    {
      severity: 'error',
      code: 'AASA_MISSING_ROUTE',
      message: 'Route /users/:id is not covered by any non-excluded AASA component.',
      fix: 'Add a component matching /users/* to applinks.details[].components.',
    },
    {
      severity: 'warn',
      code: 'AASA_ORPHAN_PATTERN',
      message: 'Component /legacy/* matches no route in the app.',
    },
  ],
  notes: ['Apple caches AASA on its CDN; changes can take up to 24h to propagate.'],
};

describe('annotationsFor', () => {
  it('maps error/warn diagnostics and notes to the right levels', () => {
    const annotations = annotationsFor(seededBad);
    expect(annotations).toEqual([
      {
        level: 'error',
        code: 'AASA_MISSING_ROUTE',
        message:
          'Route /users/:id is not covered by any non-excluded AASA component. Fix: Add a component matching /users/* to applinks.details[].components.',
      },
      {
        level: 'warning',
        code: 'AASA_ORPHAN_PATTERN',
        message: 'Component /legacy/* matches no route in the app.',
      },
      {
        level: 'notice',
        code: 'NOTE',
        message: 'Apple caches AASA on its CDN; changes can take up to 24h to propagate.',
      },
    ]);
  });

  it('is a no-op on a clean result', () => {
    expect(annotationsFor({ domain: 'ok.com', diagnostics: [], notes: [] })).toEqual([]);
    expect(annotationsFor({ domain: 'ok.com' })).toEqual([]);
  });
});

describe('toWorkflowCommand', () => {
  it('emits a GitHub workflow command with an escaped title', () => {
    expect(toWorkflowCommand(annotationsFor(seededBad)[0])).toBe(
      '::error title=rndl AASA_MISSING_ROUTE::Route /users/:id is not covered by any non-excluded AASA component. Fix: Add a component matching /users/* to applinks.details[].components.',
    );
    expect(toWorkflowCommand(annotationsFor(seededBad)[2]).startsWith('::notice ')).toBe(true);
  });

  it('escapes newlines in the message and commas/colons in the title', () => {
    const command = toWorkflowCommand({
      level: 'warning',
      code: 'A,B:C',
      message: 'line one\nline two',
    });
    expect(command).toBe('::warning title=rndl A%2CB%3AC::line one%0Aline two');
  });
});

describe('countsFor', () => {
  it('tallies by level', () => {
    expect(countsFor(annotationsFor(seededBad))).toEqual({ errors: 1, warnings: 1, notices: 1 });
  });
});

describe('summaryMarkdown', () => {
  it('renders a headed table and a failed status', () => {
    const md = summaryMarkdown(seededBad);
    expect(md).toContain('### rndl validate: example.com');
    expect(md).toContain('**failed** (1 error, 1 warning, 1 note)');
    expect(md).toContain('| `AASA_MISSING_ROUTE` |');
    expect(md).not.toContain('—'); // no em dash in user-facing output
  });

  it('says passed with no findings', () => {
    const md = summaryMarkdown({ domain: 'ok.com', diagnostics: [], notes: [] });
    expect(md).toContain('**passed** (0 error, 0 warning, 0 note)');
    expect(md).toContain('_No findings._');
  });
});

describe('main', () => {
  const write = (result) => {
    const dir = mkdtempSync(join(tmpdir(), 'rndl-action-'));
    const input = join(dir, 'validate.json');
    const summary = join(dir, 'summary.md');
    writeFileSync(input, JSON.stringify(result));
    return { input, summary };
  };

  it('prints one command per finding, writes the summary, and exits 1 on an error', () => {
    const { input, summary } = write(seededBad);
    let out = '';
    const code = main(
      ['node', 'annotate.mjs', input],
      { GITHUB_STEP_SUMMARY: summary },
      {
        stdout: (s) => (out += s),
        stderr: () => {},
      },
    );
    expect(code).toBe(1);
    expect(out.split('\n').filter(Boolean)).toHaveLength(3); // error + warning + notice
    expect(readFileSync(summary, 'utf8')).toContain('**failed** (1 error, 1 warning, 1 note)');
  });

  it('exits 0 when only warnings and fail-on is error', () => {
    const { input } = write({
      domain: 'w.com',
      diagnostics: [{ severity: 'warn', code: 'X', message: 'm' }],
      notes: [],
    });
    const code = main(['node', 'annotate.mjs', input], {}, { stdout: () => {}, stderr: () => {} });
    expect(code).toBe(0);
  });

  it('exits 1 on a warning when fail-on is warn', () => {
    const { input } = write({
      domain: 'w.com',
      diagnostics: [{ severity: 'warn', code: 'X', message: 'm' }],
      notes: [],
    });
    const code = main(
      ['node', 'annotate.mjs', input],
      { RNDL_FAIL_ON: 'warn' },
      {
        stdout: () => {},
        stderr: () => {},
      },
    );
    expect(code).toBe(1);
  });

  it('returns exit code 2 when no input file is given', () => {
    let err = '';
    const code = main(
      ['node', 'annotate.mjs'],
      {},
      { stdout: () => {}, stderr: (s) => (err += s) },
    );
    expect(code).toBe(2);
    expect(err).toContain('expected a path');
  });
});
