import { useGlobalSearchParams, usePathname, useSegments } from 'expo-router';
import { segmentsToPattern } from '../internal/segments.js';
import { useReporterCore } from '../internal/use-reporter.js';
import type { DeepLinkReporterOptions } from '../types.js';

/**
 * Development implementation behind the Expo Router `useDeepLinkReporter`
 * gate: samples the router's segments and search params each render and lets
 * {@link useReporterCore} pair them with incoming Linking URLs.
 */
export function useDeepLinkReporterImpl(options: DeepLinkReporterOptions = {}): void {
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  let stateKey: string;
  try {
    stateKey = `${pathname}|${JSON.stringify(params)}`;
  } catch {
    stateKey = pathname;
  }

  useReporterCore(
    options,
    'expo-router',
    () => ({ matchedRoute: segmentsToPattern(segments), params: { ...params } }),
    stateKey,
  );
}
