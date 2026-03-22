/**
 * JWT utilities — creation and verification using RS256 asymmetric keys
 */

import type { KeyObject } from 'node:crypto';
import * as jose from 'jose';
import type { AuthUser, SessionPayload } from './types';

export function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') return duration;

  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(
      `Invalid duration: "${duration}". Expected format: <number><unit> where unit is s (seconds), m (minutes), h (hours), or d (days). Examples: "60s", "15m", "7d".`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit] * 1000;
}

export interface CreateJWTOptions {
  claims?: (user: AuthUser) => Record<string, unknown>;
  issuer?: string;
  audience?: string;
}

export async function createJWT(
  user: AuthUser,
  privateKey: KeyObject,
  ttl: number,
  options?: CreateJWTOptions,
): Promise<string> {
  const claims = options?.claims ? options.claims(user) : {};

  const builder = new jose.SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(ttl / 1000)}s`);

  if (options?.issuer) {
    builder.setIssuer(options.issuer);
  }
  if (options?.audience) {
    builder.setAudience(options.audience);
  }

  return builder.sign(privateKey);
}

export interface VerifyJWTOptions {
  issuer?: string;
  audience?: string;
}

export async function verifyJWT(
  token: string,
  publicKey: KeyObject,
  options?: VerifyJWTOptions,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: options?.issuer,
      audience: options?.audience,
    });
    // Runtime validation: ensure required claims are present
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
}
