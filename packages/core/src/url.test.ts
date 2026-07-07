import { describe, expect, it } from 'vitest';
import type { Param, Route } from './index.js';
import { buildRouteUrl, normalizePrefix } from './url.js';

const route = (pattern: string, params: Param[] = []): Route => ({
  name: pattern,
  pattern,
  params,
  exact: true,
});

const queryParam = (name: string): Param => ({
  name,
  kind: 'query',
  optional: true,
  tsType: 'string',
});

describe('normalizePrefix', () => {
  it('turns a bare scheme into scheme://', () => {
    expect(normalizePrefix('myapp')).toBe('myapp://');
    expect(normalizePrefix('myapp:')).toBe('myapp://');
    expect(normalizePrefix('myapp://')).toBe('myapp://');
  });

  it('keeps an authority prefix and drops its trailing slash', () => {
    expect(normalizePrefix('https://example.com/')).toBe('https://example.com');
    expect(normalizePrefix('https://example.com')).toBe('https://example.com');
  });
});

describe('buildRouteUrl: path parameters', () => {
  it('substitutes a required param', () => {
    expect(buildRouteUrl(route('/users/:id'), { id: '42' }, 'myapp').url).toBe('myapp://users/42');
  });

  it('reports a missing required param and builds no URL', () => {
    const result = buildRouteUrl(route('/users/:id'), {}, 'myapp');
    expect(result.url).toBeUndefined();
    expect(result.missing).toEqual(['id']);
  });

  it('drops an absent optional param but keeps a supplied one', () => {
    expect(
      buildRouteUrl(route('/feed/article/:slug/:commentId?'), { slug: 'hi' }, 'myapp').url,
    ).toBe('myapp://feed/article/hi');
    expect(
      buildRouteUrl(
        route('/feed/article/:slug/:commentId?'),
        { slug: 'hi', commentId: '7' },
        'myapp',
      ).url,
    ).toBe('myapp://feed/article/hi/7');
  });

  it('warns when a value violates a :param(regex) constraint but still builds', () => {
    const ok = buildRouteUrl(route('/promo/:code(SUMMER|WINTER)'), { code: 'SUMMER' }, 'myapp');
    expect(ok.url).toBe('myapp://promo/SUMMER');
    expect(ok.warnings).toEqual([]);
    const bad = buildRouteUrl(route('/promo/:code(SUMMER|WINTER)'), { code: 'SPRING' }, 'myapp');
    expect(bad.url).toBe('myapp://promo/SPRING');
    expect(bad.warnings[0]).toContain('SPRING');
  });

  it('expands a catch-all across multiple segments', () => {
    expect(buildRouteUrl(route('/posts/*slug'), { slug: 'a/b/c' }, 'myapp').url).toBe(
      'myapp://posts/a/b/c',
    );
  });

  it('treats a named catch-all as optional (e.g. +not-found)', () => {
    expect(buildRouteUrl(route('/*not-found'), {}, 'myapp').url).toBe('myapp://');
  });

  it('reports a bare unnamed wildcard as missing', () => {
    const result = buildRouteUrl(route('/*'), {}, 'myapp');
    expect(result.url).toBeUndefined();
    expect(result.missing).toEqual(['*']);
  });

  it('handles expo bracket segments defensively', () => {
    expect(buildRouteUrl(route('/users/[id]/posts'), { id: '42' }, 'myapp').url).toBe(
      'myapp://users/42/posts',
    );
    expect(buildRouteUrl(route('/posts/[...slug]'), { slug: 'a/b' }, 'myapp').url).toBe(
      'myapp://posts/a/b',
    );
  });

  it('percent-encodes a slash inside a single path param', () => {
    expect(buildRouteUrl(route('/users/:id'), { id: 'a/b' }, 'myapp').url).toBe(
      'myapp://users/a%2Fb',
    );
  });
});

describe('buildRouteUrl: query and prefixes', () => {
  it('appends declared query params before undeclared extras', () => {
    const result = buildRouteUrl(
      route('/search/:q', [queryParam('sort')]),
      { q: 'shoes', sort: 'new', page: '2' },
      'myapp',
    );
    expect(result.url).toBe('myapp://search/shoes?sort=new&page=2');
    expect(result.extras).toEqual(['page']);
  });

  it('joins onto an https authority prefix with a leading slash', () => {
    expect(buildRouteUrl(route('/users/:id'), { id: '42' }, 'https://example.com/').url).toBe(
      'https://example.com/users/42',
    );
  });

  it('builds the root path for each prefix style', () => {
    expect(buildRouteUrl(route('/'), {}, 'myapp').url).toBe('myapp://');
    expect(buildRouteUrl(route('/'), {}, 'https://example.com').url).toBe('https://example.com');
  });
});
