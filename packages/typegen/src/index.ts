/**
 * Type generator for `rndl typegen`: turns a {@link RouteTable} into a
 * TypeScript module of typed deep-link helpers (`buildDeepLink`,
 * `useTypedParams`). Consumed by the `rndl` CLI; the emitted module imports its
 * tiny runtime from `@deeplink-devtools/core`.
 */
export { generateDeepLinkTypes, patternToKey } from './generate.js';
export type { GenerateOptions } from './generate.js';
export type { Param, Route, RouteTable } from '@deeplink-devtools/core';
