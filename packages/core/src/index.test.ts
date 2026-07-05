import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Diagnostic, Param, Route, RouteTable } from './index.js';

describe('@deeplink-devtools/core data model', () => {
  it('models a route table', () => {
    const id: Param = { name: 'id', kind: 'path', optional: false, tsType: 'string' };
    const route: Route = {
      name: 'users/[id]',
      pattern: '/users/:id',
      params: [id],
      sourceFile: 'app/users/[id].tsx',
      exact: true,
    };
    const table: RouteTable = { routes: [route], sourceType: 'expo-router' };

    expect(table.routes).toHaveLength(1);
    expectTypeOf(table.sourceType).toEqualTypeOf<'expo-router' | 'react-navigation'>();
    expectTypeOf(id.kind).toEqualTypeOf<'path' | 'query' | 'catch-all'>();
  });

  it('models actionable diagnostics', () => {
    const diagnostic: Diagnostic = {
      severity: 'error',
      code: 'AASA_MISSING_ROUTE',
      message: 'Pattern /users/:id is not matched by any AASA component.',
      fix: 'Add a components entry matching /users/* to your apple-app-site-association file.',
    };

    expect(diagnostic.code).toBe('AASA_MISSING_ROUTE');
    expectTypeOf(diagnostic.severity).toEqualTypeOf<'error' | 'warn'>();
  });
});
