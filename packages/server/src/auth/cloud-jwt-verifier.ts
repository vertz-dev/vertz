import { jwtVerify } from 'jose';
import type { JWKSClient } from './jwks-client';
import type { SessionPayload } from './types';

export interface CloudJWTVerifier {
  verify(token: string): Promise<SessionPayload | null>;
}

export function createCloudJWTVerifier(options: {
  jwksClient: JWKSClient;
  issuer?: string;
  audience?: string;
}): CloudJWTVerifier {
  const { jwksClient, issuer, audience } = options;

  return {
    async verify(token: string): Promise<SessionPayload | null> {
      try {
        const { payload } = await jwtVerify(token, jwksClient.getKey, {
          ...(issuer ? { issuer } : {}),
          ...(audience ? { audience } : {}),
          algorithms: ['RS256'],
        });

        // Validate required claims
        if (
          typeof payload.sub !== 'string' ||
          typeof payload.email !== 'string' ||
          typeof payload.role !== 'string' ||
          typeof payload.jti !== 'string' ||
          typeof payload.sid !== 'string'
        ) {
          return null;
        }

        // Construct SessionPayload explicitly from validated fields (no double-cast)
        return {
          sub: payload.sub,
          email: payload.email as string,
          role: payload.role as string,
          jti: payload.jti as string,
          sid: payload.sid as string,
          iat: payload.iat!,
          exp: payload.exp!,
          ...(typeof payload.tenantId === 'string' ? { tenantId: payload.tenantId } : {}),
          ...(payload.claims && typeof payload.claims === 'object'
            ? { claims: payload.claims as Record<string, unknown> }
            : {}),
        } satisfies SessionPayload;
      } catch (error: unknown) {
        // Expected JWT validation errors → return null (invalid token, user error)
        if (isJwtValidationError(error)) {
          return null;
        }
        // Infrastructure errors (JWKS endpoint down, network errors) → re-throw
        throw error;
      }
    },
  };
}

/** Returns true for expected JWT validation failures (expired, wrong sig, claim mismatch). */
function isJwtValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  // jose uses error codes: ERR_JWT_EXPIRED, ERR_JWS_SIGNATURE_VERIFICATION_FAILED,
  // ERR_JWT_CLAIM_VALIDATION_FAILED, ERR_JWK_NOT_FOUND (unknown kid)
  return (
    code === 'ERR_JWT_EXPIRED' ||
    code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' ||
    code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' ||
    code === 'ERR_JWK_NOT_FOUND'
  );
}
