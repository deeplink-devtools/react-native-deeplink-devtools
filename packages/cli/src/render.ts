import type { Diagnostic, Param, Route, RouteTable } from '@deeplink-devtools/core';

/** Control Sequence Introducer (ESC + `[`), the prefix of every ANSI style code. */
const CSI = `${String.fromCharCode(27)}[`;

/** ANSI styles used by the pretty renderer; applied only when `color` is true. */
const ANSI = {
  bold: [`${CSI}1m`, `${CSI}22m`],
  dim: [`${CSI}2m`, `${CSI}22m`],
  cyan: [`${CSI}36m`, `${CSI}39m`],
  yellow: [`${CSI}33m`, `${CSI}39m`],
  red: [`${CSI}31m`, `${CSI}39m`],
} as const;

type StyleName = keyof typeof ANSI;

/** Wrap `text` in the named ANSI style when `color` is on; otherwise pass it through. */
export function paint(color: boolean, style: StyleName, text: string): string {
  if (!color || text.length === 0) {
    return text;
  }
  const [open, close] = ANSI[style];
  return `${open}${text}${close}`;
}

/** `true` when stdout is an interactive terminal and color is not disabled. */
export function shouldColor(): boolean {
  return (
    process.stdout.isTTY === true &&
    process.env['NO_COLOR'] === undefined &&
    process.env['NODE_DISABLE_COLORS'] === undefined
  );
}

function formatParams(params: Param[]): string {
  if (params.length === 0) {
    return '-';
  }
  return params
    .map(
      (p) =>
        `${p.name}${p.optional ? '?' : ''}: ${p.tsType}${p.kind === 'query' ? ' (query)' : ''}`,
    )
    .join(', ');
}

/** Color dynamic (`:x`) and catch-all (`*x`) segments so they stand out. */
function formatPattern(pattern: string, color: boolean): string {
  return pattern
    .split('/')
    .map((segment) =>
      segment.startsWith(':') || segment.startsWith('*') ? paint(color, 'cyan', segment) : segment,
    )
    .join('/');
}

/**
 * Render a route table as an aligned plain-text table for terminals, ending
 * in a summary line: route count, source type, then the adapter-specific
 * `summaryExtras` (e.g. API-route or prefix counts). Pure function of its
 * inputs - no I/O - so it is directly unit-testable.
 */
export function renderRoutesTable(
  table: RouteTable,
  summaryExtras: string[],
  color: boolean,
): string {
  const { routes } = table;
  const header = ['PATTERN', 'PARAMS', 'SOURCE'];
  const rows: string[][] = routes.map((route: Route) => [
    route.pattern,
    formatParams(route.params),
    route.sourceFile ?? '',
  ]);

  const widths = header.map((h, column) =>
    Math.max(h.length, ...rows.map((row) => (row[column] as string).length)),
  );

  const lines: string[] = [];
  lines.push(header.map((h, i) => paint(color, 'bold', h.padEnd(widths[i] as number))).join('  '));
  for (const row of rows) {
    const [pattern, params, source] = row as [string, string, string];
    lines.push(
      [
        formatPattern(pattern, color) + ' '.repeat((widths[0] as number) - pattern.length),
        params.padEnd(widths[1] as number),
        paint(color, 'dim', source),
      ].join('  '),
    );
  }

  const summary: string[] = [
    `${routes.length} route${routes.length === 1 ? '' : 's'} (${table.sourceType})`,
    ...summaryExtras,
  ];
  lines.push('');
  lines.push(paint(color, 'dim', summary.join(', ')));

  return lines.join('\n');
}

/**
 * Render diagnostics for stderr, one block per finding, with its fix when known.
 */
export function renderDiagnostics(diagnostics: Diagnostic[], color: boolean): string {
  return diagnostics
    .map((d) => {
      const label = paint(color, d.severity === 'error' ? 'red' : 'yellow', d.severity);
      const fix = d.fix === undefined ? '' : `\n  fix: ${d.fix}`;
      return `${label} ${d.code}: ${d.message}${fix}`;
    })
    .join('\n');
}

/** Render informational notes, one dim `note:` block per entry. */
export function renderNotes(notes: string[], color: boolean): string {
  return notes.map((note) => paint(color, 'dim', `note: ${note}`)).join('\n');
}

/**
 * One-line count of errors and warnings, e.g. `2 errors, 1 warning` or `clean`,
 * for the summary of a validate run.
 */
export function summarizeDiagnostics(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  if (errors === 0 && warnings === 0) {
    return 'clean';
  }
  const parts: string[] = [];
  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}
