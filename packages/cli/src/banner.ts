/**
 * Builds the one-line banner the CLI prints while its commands are still in development.
 *
 * @param name - The npm package name, read from package.json.
 * @param version - The installed package version, read from package.json.
 */
export function banner(name: string, version: string): string {
  return `${name} v${version} — commands (routes, validate, open, interactive) land in upcoming releases.`;
}
