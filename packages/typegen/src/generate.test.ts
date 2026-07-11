import type { RouteTable } from '@deeplink-devtools/core';
import { describe, expect, it } from 'vitest';
import { generateDeepLinkTypes, patternToKey } from './generate.js';

const expoTable: RouteTable = {
  sourceType: 'expo-router',
  routes: [
    { name: 'app/index', pattern: '/', params: [], exact: true },
    { name: 'app/about', pattern: '/about', params: [], exact: true },
    {
      name: 'app/users/[id]/index',
      pattern: '/users/:id',
      params: [{ name: 'id', kind: 'path', optional: false, tsType: 'string' }],
      exact: true,
    },
    {
      name: 'app/posts/[...slug]',
      pattern: '/posts/*slug',
      params: [{ name: 'slug', kind: 'catch-all', optional: false, tsType: 'string[]' }],
      exact: false,
    },
    {
      name: 'app/search',
      pattern: '/search',
      params: [{ name: 'q', kind: 'query', optional: true, tsType: 'string' }],
      exact: true,
    },
  ],
};

const rnavTable: RouteTable = {
  sourceType: 'react-navigation',
  routes: [
    { name: 'HomeTabs/Feed', pattern: '/feed', params: [], exact: false },
    // Same pattern as the navigator above: the initial child. Must de-duplicate.
    { name: 'HomeTabs/Feed/FeedList', pattern: '/feed', params: [], exact: false },
    {
      name: 'HomeTabs/Feed/Article',
      pattern: '/feed/article/:slug/:commentId?',
      params: [
        { name: 'slug', kind: 'path', optional: false, tsType: 'string' },
        { name: 'commentId', kind: 'path', optional: true, tsType: 'unknown (custom parse)' },
      ],
      exact: false,
    },
    {
      name: 'HomeTabs/Profile',
      pattern: '/user/:id',
      params: [{ name: 'id', kind: 'path', optional: false, tsType: 'unknown (custom parse)' }],
      exact: false,
    },
  ],
};

describe('patternToKey', () => {
  it('rewrites Expo Router patterns to the bracket form', () => {
    expect(patternToKey('/users/:id', 'expo-router')).toBe('/users/[id]');
    expect(patternToKey('/posts/*slug', 'expo-router')).toBe('/posts/[...slug]');
    expect(patternToKey('/*not-found', 'expo-router')).toBe('/[...not-found]');
    expect(patternToKey('/promo/:code(SUMMER|WINTER)', 'expo-router')).toBe('/promo/[code]');
    expect(patternToKey('/feed/article/:slug/:commentId?', 'expo-router')).toBe(
      '/feed/article/[slug]/[commentId]',
    );
    expect(patternToKey('/', 'expo-router')).toBe('/');
  });

  it('leaves React Navigation patterns untouched', () => {
    expect(patternToKey('/users/:id', 'react-navigation')).toBe('/users/:id');
    expect(patternToKey('/posts/*slug', 'react-navigation')).toBe('/posts/*slug');
  });
});

describe('generateDeepLinkTypes (expo-router)', () => {
  const out = generateDeepLinkTypes(expoTable, { defaultPrefix: 'myapp://' });

  it('emits bracket-form keys and the expo-router hook import', () => {
    expect(out).toContain("import { useLocalSearchParams } from 'expo-router';");
    expect(out).toContain("import { buildRouteUrl, type Route } from '@deeplink-devtools/core';");
    expect(out).toContain('"/users/[id]":');
    expect(out).toContain('"/posts/[...slug]":');
  });

  it('builds param types as strings and reads them as the router hands them back', () => {
    // Building map: everything is string, catch-all is one string.
    expect(out).toContain('export interface DeepLinkRoutes {');
    expect(out).toMatch(/"\/users\/\[id\]": \{ id: string \};/);
    expect(out).toMatch(/"\/posts\/\[\.\.\.slug\]": \{ slug: string \};/);
    // Reading map: catch-all is string[].
    expect(out).toContain('export interface DeepLinkParams {');
    expect(out).toMatch(/"\/posts\/\[\.\.\.slug\]": \{ slug: string\[\] \};/);
  });

  it('marks query params optional and empty routes as Record<string, never>', () => {
    expect(out).toMatch(/"\/search": \{ q\?: string \};/);
    expect(out).toMatch(/"\/about": Record<string, never>;/);
  });

  it('bakes the prefix and stores the colon pattern in the runtime ROUTES map', () => {
    expect(out).toContain('const DEFAULT_PREFIX = "myapp://";');
    // The developer-facing key is bracket form, but the Route it maps to keeps
    // the colon pattern that buildRouteUrl consumes.
    expect(out).toContain('"/users/[id]": {"name":"app/users/[id]/index","pattern":"/users/:id"');
  });

  it('emits the typed helpers', () => {
    expect(out).toContain('export function buildDeepLink<R extends keyof DeepLinkRoutes>(');
    expect(out).toContain(
      'export function useTypedParams<R extends keyof DeepLinkParams>(): DeepLinkParams[R] {',
    );
    expect(out).toContain('return useLocalSearchParams() as unknown as DeepLinkParams[R];');
  });
});

describe('generateDeepLinkTypes (react-navigation)', () => {
  const out = generateDeepLinkTypes(rnavTable, { defaultPrefix: 'examplereactnavigation://' });

  it('keeps colon keys and imports the React Navigation hook', () => {
    expect(out).toContain("import { useRoute } from '@react-navigation/native';");
    expect(out).toContain('"/user/:id":');
    expect(out).toContain('"/feed/article/:slug/:commentId?":');
    expect(out).toContain('return (useRoute().params ?? {}) as unknown as DeepLinkParams[R];');
  });

  it('types custom-parse params as unknown in the reading map', () => {
    // Reading: id is unknown (custom parse).
    expect(out).toMatch(/"\/user\/:id": \{ id: unknown \};/);
    // commentId is optional + unknown; slug stays a string.
    expect(out).toMatch(
      /"\/feed\/article\/:slug\/:commentId\?": \{ slug: string; commentId\?: unknown \};/,
    );
    // Building map still takes strings for the same params.
    expect(out).toMatch(
      /"\/feed\/article\/:slug\/:commentId\?": \{ slug: string; commentId\?: string \};/,
    );
  });

  it('de-duplicates routes that share a URL pattern', () => {
    const feedKeys = out.match(/"\/feed":/g) ?? [];
    // One occurrence in DeepLinkRoutes, one in DeepLinkParams, one in ROUTES = 3.
    expect(feedKeys).toHaveLength(3);
  });
});
