/**
 * React Native's global development flag. Metro inlines it as a boolean
 * literal at build time, so production builds constant-fold the guarded
 * branches away — together with every module they `require()`.
 *
 * This declaration is compile-time only; it is not shipped in `dist`.
 */
declare const __DEV__: boolean;
