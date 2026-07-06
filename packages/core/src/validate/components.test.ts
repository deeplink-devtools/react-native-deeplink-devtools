import { describe, expect, it } from 'vitest';
import type { Route } from '../index.js';
import { matchAasaComponentPath, routePatternToExamplePath } from './components.js';

const route = (pattern: string): Route => ({ name: pattern, pattern, params: [], exact: true });

describe('matchAasaComponentPath', () => {
  it('matches a literal path', () => {
    expect(matchAasaComponentPath('/about', '/about')).toBe(true);
    expect(matchAasaComponentPath('/about', '/contact')).toBe(false);
  });

  it('treats * as any run of characters', () => {
    expect(matchAasaComponentPath('/buy/*', '/buy/a/b/c')).toBe(true);
    expect(matchAasaComponentPath('/buy/*', '/sell/a')).toBe(false);
    expect(matchAasaComponentPath('/*', '/anything/at/all')).toBe(true);
  });

  it('treats ? as exactly one character', () => {
    expect(matchAasaComponentPath('/item/?', '/item/5')).toBe(true);
    expect(matchAasaComponentPath('/item/?', '/item/42')).toBe(false);
  });

  it('is case-insensitive by default and case-sensitive on request', () => {
    expect(matchAasaComponentPath('/Buy/*', '/buy/x')).toBe(true);
    expect(matchAasaComponentPath('/Buy/*', '/buy/x', { caseSensitive: true })).toBe(false);
  });

  it('anchors the whole path (no partial match)', () => {
    expect(matchAasaComponentPath('/buy', '/buy/extra')).toBe(false);
  });

  it('escapes regex metacharacters in the literal parts', () => {
    expect(matchAasaComponentPath('/a.b', '/aXb')).toBe(false);
    expect(matchAasaComponentPath('/a.b', '/a.b')).toBe(true);
  });
});

describe('routePatternToExamplePath', () => {
  it('substitutes a single segment for a dynamic param', () => {
    expect(routePatternToExamplePath(route('/users/:id'))).toBe('/users/x');
  });

  it('substitutes multiple segments for a catch-all', () => {
    expect(routePatternToExamplePath(route('/posts/*slug'))).toBe('/posts/x/y');
  });

  it('handles expo-style bracket segments', () => {
    expect(routePatternToExamplePath(route('/users/[id]/posts'))).toBe('/users/x/posts');
    expect(routePatternToExamplePath(route('/posts/[...slug]'))).toBe('/posts/x/y');
  });

  it('keeps static paths and the root', () => {
    expect(routePatternToExamplePath(route('/about'))).toBe('/about');
    expect(routePatternToExamplePath(route('/'))).toBe('/');
  });

  it('drops a query string', () => {
    expect(routePatternToExamplePath(route('/search?q=:q'))).toBe('/search');
  });
});
