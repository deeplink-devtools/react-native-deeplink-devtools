/**
 * Parse dotenv file text into a flat string map.
 *
 * Supports the subset react-native-dotenv reads by default: `KEY=VALUE`
 * lines, blank lines, full-line `#` comments, an optional `export ` prefix,
 * and single- or double-quoted values (a matching quote pair is stripped;
 * `\n` inside double quotes becomes a newline). No variable expansion and
 * no inline-comment stripping: an unquoted value runs to the end of the line.
 *
 * Lines without a `KEY=` shaped start are skipped silently, mirroring how
 * dotenv parsers tolerate junk lines.
 */
export function parseDotenv(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trimStart() : trimmed;

    const eq = withoutExport.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let value = withoutExport.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      if ((first === '"' || first === "'") && value.endsWith(first)) {
        value = value.slice(1, -1);
        if (first === '"') {
          value = value.replaceAll('\\n', '\n');
        }
      }
    }

    values[key] = value;
  }

  return values;
}

/**
 * Render parsed dotenv values as the source text of an ES module that stands
 * in for react-native-dotenv's `@env` virtual module: one named export per
 * key plus a default export object. Keys are guaranteed to be valid
 * identifiers by {@link parseDotenv}; values are JSON-escaped.
 */
export function renderEnvModuleSource(values: Record<string, string>): string {
  const lines = Object.entries(values).map(
    ([key, value]) => `export const ${key} = ${JSON.stringify(value)};`,
  );
  lines.push(`export default ${JSON.stringify(values)};`);
  return `${lines.join('\n')}\n`;
}
