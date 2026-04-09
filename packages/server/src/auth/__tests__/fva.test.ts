import { describe, expect, it } from '@vertz/test';
import { checkFva } from '../fva';
import type { SessionPayload } from '../types';

function makePayload(fva?: number): SessionPayload {
  return {
    sub: 'user-1',
    email: 'test@example.com',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'jti-1',
    sid: 'sid-1',
    fva,
  };
}

describe('checkFva', () => {
  it('returns true when fva is within maxAge', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = makePayload(now - 30); // 30 seconds ago
    expect(checkFva(payload, 300)).toBe(true); // 5 min window
  });

  it('returns false when fva exceeds maxAge', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = makePayload(now - 600); // 10 minutes ago
    expect(checkFva(payload, 300)).toBe(false); // 5 min window
  });

  it('returns false when fva is missing', () => {
    const payload = makePayload(undefined);
    expect(checkFva(payload, 300)).toBe(false);
  });
});
