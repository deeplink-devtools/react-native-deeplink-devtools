// Turns `rndl validate --json` output into GitHub Actions annotations, a job
// summary, and an exit code. Kept as a pure core (annotationsFor / summaryMarkdown /
// toWorkflowCommand) with a thin IO wrapper (main) so the mapping is unit-testable
// without a GitHub runner. Plain ESM, zero dependencies.
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ severity: 'error' | 'warn', code: string, message: string, fix?: string }} Diagnostic
 * @typedef {{ domain: string, diagnostics?: Diagnostic[], notes?: string[] }} ValidationResult
 * @typedef {{ level: 'error' | 'warning' | 'notice', code: string, message: string }} Annotation
 */

/**
 * Map a `rndl validate` result to GitHub annotations. Error/warn diagnostics
 * become error/warning annotations (with the fix appended when present);
 * informational notes become notices. Pure.
 *
 * @param {ValidationResult} result
 * @returns {Annotation[]}
 */
export function annotationsFor(result) {
  const fromDiagnostics = (result.diagnostics ?? []).map((d) => ({
    level: /** @type {const} */ (d.severity === 'error' ? 'error' : 'warning'),
    code: d.code,
    message: d.fix ? `${d.message} Fix: ${d.fix}` : d.message,
  }));
  const fromNotes = (result.notes ?? []).map((text) => ({
    level: /** @type {const} */ ('notice'),
    code: 'NOTE',
    message: text,
  }));
  return [...fromDiagnostics, ...fromNotes];
}

/** GitHub workflow-command data escaping (message body). */
const escapeData = (value) =>
  String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** GitHub workflow-command property escaping (e.g. the title). */
const escapeProperty = (value) => escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');

/**
 * Render one annotation as a GitHub Actions workflow-command line. With no file
 * or line, GitHub attaches it to the run and the pull request. Pure.
 *
 * @param {Annotation} annotation
 * @returns {string}
 */
export function toWorkflowCommand(annotation) {
  const title = escapeProperty(`rndl ${annotation.code}`);
  return `::${annotation.level} title=${title}::${escapeData(annotation.message)}`;
}

/**
 * Count annotations by level. Pure.
 *
 * @param {Annotation[]} annotations
 * @returns {{ errors: number, warnings: number, notices: number }}
 */
export function countsFor(annotations) {
  return {
    errors: annotations.filter((a) => a.level === 'error').length,
    warnings: annotations.filter((a) => a.level === 'warning').length,
    notices: annotations.filter((a) => a.level === 'notice').length,
  };
}

/**
 * A Markdown block for `$GITHUB_STEP_SUMMARY`. Pure.
 *
 * @param {ValidationResult} result
 * @returns {string}
 */
export function summaryMarkdown(result) {
  const annotations = annotationsFor(result);
  const { errors, warnings, notices } = countsFor(annotations);
  const status = errors > 0 ? 'failed' : 'passed';
  const rows = annotations.map(
    (a) => `| ${a.level} | \`${a.code}\` | ${a.message.replace(/\|/g, '\\|')} |`,
  );
  const table =
    rows.length > 0
      ? ['| Level | Code | Detail |', '| --- | --- | --- |', ...rows].join('\n')
      : '_No findings._';
  return [
    `### rndl validate: ${result.domain}`,
    '',
    `**${status}** (${errors} error, ${warnings} warning, ${notices} note)`,
    '',
    table,
    '',
  ].join('\n');
}

/**
 * IO wrapper: read the validate JSON, print workflow commands, append the job
 * summary, and set the exit code per `fail-on`.
 *
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{ stdout: (s: string) => void, stderr: (s: string) => void }} io
 * @returns {number} the intended process exit code
 */
export function main(argv, env, io) {
  const file = argv[2];
  if (!file) {
    io.stderr('annotate.mjs: expected a path to the `rndl validate --json` output\n');
    return 2;
  }
  /** @type {ValidationResult} */
  const result = JSON.parse(readFileSync(file, 'utf8'));
  const annotations = annotationsFor(result);
  for (const annotation of annotations) {
    io.stdout(`${toWorkflowCommand(annotation)}\n`);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${summaryMarkdown(result)}\n`);
  }
  const failOn = (env.RNDL_FAIL_ON ?? 'error').toLowerCase();
  const { errors, warnings } = countsFor(annotations);
  const failed = failOn === 'warn' ? errors + warnings > 0 : errors > 0;
  return failed ? 1 : 0;
}

// Run only when invoked directly (`node annotate.mjs <file>`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv, process.env, {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
}
