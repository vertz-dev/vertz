/**
 * JWT utilities — creation and verification
 */

import * as jose from 'jose';
import type { AuthUser, SessionPayload } from './types';

export function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') return duration;

  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit] * 1000;
}

export async function createJWT(
  user: AuthUser,
  secret: string,
  ttl: number,
  algorithm: string,
  customClaims?: (user: AuthUser) => Record<string, unknown>,
): Promise<string> {
  const claims = customClaims ? customClaims(user) : {};

  const jwt = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    ...claims,
  })
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(ttl / 1000)}s`)
    .sign(new TextEncoder().encode(secret));

  return jwt;
}

export async function verifyJWT(
  token: string,
  secret: string,
  algorithm: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: [algorithm],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
