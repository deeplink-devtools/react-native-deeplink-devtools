/**
 * Ambient declaration so the `env/linking.ts` fixture typechecks: in a real
 * app react-native-dotenv ships a similar user-authored declaration for its
 * virtual `@env` module.
 */
declare module '@env' {
  export const DEEP_LINK_DOMAIN: string;
  export const SCHEME: string;
  export const NOT_SET: string | undefined;
}
