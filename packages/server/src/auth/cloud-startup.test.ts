import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCloudAuthContext, validateProjectId } from './cloud-startup';

// --- Project ID Validation ---

describe('validateProjectId', () => {
  it('does not throw for valid projectId matching proj_<alphanum>', () => {
    expect(() => validateProjectId('proj_abc123')).not.toThrow();
    expect(() => validateProjectId('proj_ABC')).not.toThrow();
    expect(() => validateProjectId('proj_a1b2c3d4')).not.toThrow();
  });

  it('throws with format error for projectId without proj_ prefix', () => {
    expect(() => validateProjectId('abc123')).toThrow(/proj_/);
  });

  it('throws with format error for empty string projectId', () => {
    expect(() => validateProjectId('')).toThrow();
  });

  it('throws for projectId with only the prefix and no suffix', () => {
    expect(() => validateProjectId('proj_')).toThrow();
  });
});

// --- Cloud Auth Context ---

describe('resolveCloudAuthContext', () => {
  let tempDir: string;
  const originalEnv = process.env.VERTZ_CLOUD_TOKEN;

  beforeEach(() => {
    tempDir = join(tmpdir(), `vertz-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    delete process.env.VERTZ_CLOUD_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VERTZ_CLOUD_TOKEN = originalEnv;
    } else {
      delete process.env.VERTZ_CLOUD_TOKEN;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns { token, source: "developer-session" } when auth.json exists with valid token', () => {
    const sessionPath = join(tempDir, 'auth.json');
    writeFileSync(sessionPath, JSON.stringify({ token: 'vtk_dev_token_123', expiresAt: Date.now() + 3600_000 }));

    const result = resolveCloudAuthContext({ projectId: 'proj_test', sessionPath });
    expect(result.token).toBe('vtk_dev_token_123');
    expect(result.source).toBe('developer-session');
  });

  it('throws with "session expired or corrupted" when auth.json exists but is expired', () => {
    const sessionPath = join(tempDir, 'auth.json');
    writeFileSync(sessionPath, JSON.stringify({ token: 'vtk_expired', expiresAt: Date.now() - 1000 }));

    expect(() => resolveCloudAuthContext({ projectId: 'proj_test', sessionPath })).toThrow(
      /session expired or corrupted/i,
    );
  });

  it('throws with "session expired or corrupted" when auth.json is malformed', () => {
    const sessionPath = join(tempDir, 'auth.json');
    writeFileSync(sessionPath, 'not json {{{');

    expect(() => resolveCloudAuthContext({ projectId: 'proj_test', sessionPath })).toThrow(
      /session expired or corrupted/i,
    );
  });

  it('includes "vertz login" command in expired session error', () => {
    const sessionPath = join(tempDir, 'auth.json');
    writeFileSync(sessionPath, JSON.stringify({ token: 'vtk_expired', expiresAt: Date.now() - 1000 }));

    expect(() => resolveCloudAuthContext({ projectId: 'proj_test', sessionPath })).toThrow(/vertz login/);
  });

  it('returns { token, source: "ci-token" } when VERTZ_CLOUD_TOKEN env var is set', () => {
    const sessionPath = join(tempDir, 'auth.json'); // File doesn't exist
    process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token_456';

    const result = resolveCloudAuthContext({ projectId: 'proj_test', sessionPath });
    expect(result.token).toBe('vtk_ci_token_456');
    expect(result.source).toBe('ci-token');
  });

  it('prefers VERTZ_CLOUD_TOKEN over auth.json when both exist (CI takes precedence)', () => {
    const sessionPath = join(tempDir, 'auth.json');
    writeFileSync(sessionPath, JSON.stringify({ token: 'vtk_dev_session', expiresAt: Date.now() + 3600_000 }));
    process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_override';

    const result = resolveCloudAuthContext({ projectId: 'proj_test', sessionPath });
    expect(result.token).toBe('vtk_ci_override');
    expect(result.source).toBe('ci-token');
  });

  it('throws with prescriptive error when no auth.json, no VERTZ_CLOUD_TOKEN', () => {
    const sessionPath = join(tempDir, 'nonexistent-auth.json');

    expect(() => resolveCloudAuthContext({ projectId: 'proj_test', sessionPath })).toThrow(
      /Cloud auth requires authentication/,
    );
  });

  it('error message includes "vertz login" command', () => {
    const sessionPath = join(tempDir, 'nonexistent-auth.json');

    expect(() => resolveCloudAuthContext({ projectId: 'proj_test', sessionPath })).toThrow(/vertz login/);
  });

  it('error message includes VERTZ_CLOUD_TOKEN env var', () => {
    const sessionPath = join(tempDir, 'nonexistent-auth.json');

    expect(() => resolveCloudAuthContext({ projectId: 'proj_test', sessionPath })).toThrow(/VERTZ_CLOUD_TOKEN/);
  });

  it('error message includes session file path', () => {
    const sessionPath = join(tempDir, 'nonexistent-auth.json');

    expect(() => resolveCloudAuthContext({ projectId: 'proj_test', sessionPath })).toThrow(
      new RegExp(sessionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  });
});
