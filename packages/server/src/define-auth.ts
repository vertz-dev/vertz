import type { AuthConfig } from './auth/types';

/**
 * Identity function that preserves the full AuthConfig type.
 *
 * Allows defining auth configuration in a separate file
 * while retaining full type inference and autocomplete:
 *
 * ```ts
 * // auth.ts
 * export const auth = defineAuth({
 *   session: { strategy: 'jwt', ttl: '15m' },
 *   emailPassword: { enabled: true },
 * });
 *
 * // server.ts
 * import { auth } from './auth';
 * createServer({ db, auth, entities: [...] });
 * ```
 */
export function defineAuth<T extends AuthConfig>(config: T): T {
  return config;
}
