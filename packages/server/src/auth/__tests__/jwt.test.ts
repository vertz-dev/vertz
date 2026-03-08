/**
 * JWT utility tests — parseDuration, createJWT, verifyJWT
 */

import { describe, expect, it } from 'bun:test';
import { createJWT, parseDuration, verifyJWT } from '../jwt';
import type { AuthUser } from '../types';

const TEST_SECRET = 'jwt-test-secret-at-least-32-characters-long';

const testUser: AuthUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('parseDuration', () => {
  it('returns number input as-is', () => {
    expect(parseDuration(5000)).toBe(5000);
  });

  it('parses seconds', () => {
    expect(parseDuration('60s')).toBe(60_000);
  });

  it('parses minutes', () => {
    expect(parseDuration('15m')).toBe(900_000);
  });

  it('parses hours', () => {
    expect(parseDuration('1h')).toBe(3_600_000);
  });

  it('parses days', () => {
    expect(parseDuration('7d')).toBe(604_800_000);
  });

  it('throws on invalid format with helpful message', () => {
    expect(() => parseDuration('invalid')).toThrow(
      'Invalid duration: "invalid". Expected format: <number><unit>',
    );
  });

  it('throws on empty string', () => {
    expect(() => parseDuration('')).toThrow('Invalid duration');
  });
});

describe('createJWT', () => {
  it('creates a valid JWT string', async () => {
    const jwt = await createJWT(testUser, TEST_SECRET, 60_000, 'HS256');
    expect(jwt).toBeDefined();
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('includes custom claims', async () => {
    const jwt = await createJWT(testUser, TEST_SECRET, 60_000, 'HS256', () => ({
      jti: 'test-jti',
      sid: 'test-sid',
    }));

    const payload = await verifyJWT(jwt, TEST_SECRET, 'HS256');
    expect(payload?.jti).toBe('test-jti');
    expect(payload?.sid).toBe('test-sid');
  });
});

describe('verifyJWT', () => {
  it('returns payload for valid token', async () => {
    const jwt = await createJWT(testUser, TEST_SECRET, 60_000, 'HS256', () => ({
      jti: 'jti-1',
      sid: 'sid-1',
    }));

    const payload = await verifyJWT(jwt, TEST_SECRET, 'HS256');
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-123');
    expect(payload?.email).toBe('test@example.com');
    expect(payload?.role).toBe('user');
    expect(payload?.jti).toBe('jti-1');
    expect(payload?.sid).toBe('sid-1');
  });

  it('returns null for expired token', async () => {
    const jwt = await createJWT(testUser, TEST_SECRET, 1, 'HS256', () => ({
      jti: 'jti-exp',
      sid: 'sid-exp',
    }));

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const payload = await verifyJWT(jwt, TEST_SECRET, 'HS256');
    expect(payload).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const jwt = await createJWT(testUser, TEST_SECRET, 60_000, 'HS256', () => ({
      jti: 'jti-2',
      sid: 'sid-2',
    }));

    const payload = await verifyJWT(jwt, 'wrong-secret-at-least-32-characters', 'HS256');
    expect(payload).toBeNull();
  });

  it('returns null for tampered token', async () => {
    const jwt = await createJWT(testUser, TEST_SECRET, 60_000, 'HS256', () => ({
      jti: 'jti-3',
      sid: 'sid-3',
    }));

    const tampered = `${jwt.slice(0, -5)}XXXXX`;
    const payload = await verifyJWT(tampered, TEST_SECRET, 'HS256');
    expect(payload).toBeNull();
  });

  it('returns null for garbage input', async () => {
    const payload = await verifyJWT('not-a-jwt', TEST_SECRET, 'HS256');
    expect(payload).toBeNull();
  });

  it('returns null when required claims are missing (no jti/sid)', async () => {
    // Create a JWT without jti and sid claims
    const jwt = await createJWT(testUser, TEST_SECRET, 60_000, 'HS256');

    const payload = await verifyJWT(jwt, TEST_SECRET, 'HS256');
    expect(payload).toBeNull();
  });
});
