import { describe, expect, it } from 'vitest';
import { parseDotenv, renderEnvModuleSource } from './dotenv.js';

describe('parseDotenv', () => {
  it('parses KEY=VALUE lines, skipping comments and blanks', () => {
    expect(
      parseDotenv('# a comment\n\nDOMAIN=example.com\n  # indented comment\nPORT=8081\n'),
    ).toEqual({
      DOMAIN: 'example.com',
      PORT: '8081',
    });
  });

  it('strips matching single and double quotes', () => {
    expect(parseDotenv('A="double quoted"\nB=\'single quoted\'\nC="unbalanced\'')).toEqual({
      A: 'double quoted',
      B: 'single quoted',
      C: '"unbalanced\'',
    });
  });

  it('unescapes \\n inside double quotes only', () => {
    expect(parseDotenv('A="line1\\nline2"\nB=\'raw\\n\'')).toEqual({
      A: 'line1\nline2',
      B: 'raw\\n',
    });
  });

  it('tolerates an export prefix', () => {
    expect(parseDotenv('export DOMAIN=example.com')).toEqual({ DOMAIN: 'example.com' });
  });

  it('splits on the first = only', () => {
    expect(parseDotenv('URL=https://example.com/?a=1&b=2')).toEqual({
      URL: 'https://example.com/?a=1&b=2',
    });
  });

  it('handles CRLF line endings and a BOM', () => {
    expect(parseDotenv('﻿A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('skips lines without a valid key', () => {
    expect(parseDotenv('not a var line\n=novalue\n1BAD=x\nGOOD=y')).toEqual({ GOOD: 'y' });
  });
});

describe('renderEnvModuleSource', () => {
  it('emits one named export per key plus a default object', () => {
    const source = renderEnvModuleSource({ DOMAIN: 'example.com', SCHEME: 'myapp' });
    expect(source).toContain('export const DOMAIN = "example.com";');
    expect(source).toContain('export const SCHEME = "myapp";');
    expect(source).toContain('export default {"DOMAIN":"example.com","SCHEME":"myapp"};');
  });

  it('JSON-escapes values', () => {
    const source = renderEnvModuleSource({ TRICKY: 'a "quote" and a\nnewline' });
    expect(source).toContain('export const TRICKY = "a \\"quote\\" and a\\nnewline";');
  });
});
