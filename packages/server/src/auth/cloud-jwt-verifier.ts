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

        return payload as unknown as SessionPayload;
      } catch {
        return null;
      }
    },
  };
}
