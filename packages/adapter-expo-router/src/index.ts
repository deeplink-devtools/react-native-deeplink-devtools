/**
 * Expo Router adapter: walks an `app/` (or `src/app/`) directory and produces
 * the normalized {@link RouteTable} used by every rndl command.
 *
 * The scan is static — file names only, no user code execution — and verified
 * against expo-router 57 (Expo SDK 57) conventions.
 */
export { buildRouteTable } from './scan.js';
export type { ExpoRouterLayout, ExpoRouterScanResult } from './scan.js';
export type { Diagnostic, Param, ParamKind, Route, RouteTable } from '@deeplink-devtools/core';
