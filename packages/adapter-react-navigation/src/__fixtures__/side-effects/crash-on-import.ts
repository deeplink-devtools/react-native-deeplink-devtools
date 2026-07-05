/**
 * Mimics what happens when a linking module (transitively) imports app code:
 * react-native modules throw at import time outside a native runtime.
 */
throw new Error("Native module 'PlatformConstants' is not available");
