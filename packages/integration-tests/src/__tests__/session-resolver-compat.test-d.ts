/**
 * Type-level test: AuthInstance.resolveSessionForSSR must be assignable to SessionResolver.
 *
 * Regression test for #1259: the loose types on AuthInstance.resolveSessionForSSR
 * (Record<string, unknown> for user, unknown for accessSet) were not assignable to
 * SessionResolver's SSRSessionInfo type.
 */
import { describe, it } from '@vertz/test';
import type { AuthInstance } from '@vertz/server';
import type { SessionResolver } from '@vertz/ui-server';

declare const auth: AuthInstance;

describe('SessionResolver compatibility (#1259)', () => {
  it('AuthInstance.resolveSessionForSSR is assignable to SessionResolver', () => {
    const _resolver: SessionResolver = auth.resolveSessionForSSR;
    void _resolver;
  });

  it('rejects a resolver returning wrong user shape', () => {
    // @ts-expect-error — session.user missing required structure
    const _resolver: SessionResolver = async (_req: Request) => ({
      session: { user: 'not-an-object', expiresAt: 123 },
    });
    void _resolver;
  });

  it('rejects a resolver returning wrong accessSet type', () => {
    // @ts-expect-error — accessSet must be AccessSet | null | undefined, not string
    const _resolver: SessionResolver = async (_req: Request) => ({
      session: { user: { id: '1', email: 'a@b.c', role: 'user' }, expiresAt: 123 },
      accessSet: 'not-an-access-set',
    });
    void _resolver;
  });
});
