import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface CloudAuthContext {
  token: string;
  source: 'developer-session' | 'ci-token';
}

const PROJECT_ID_PATTERN = /^proj_[a-zA-Z0-9]+$/;

export function validateProjectId(projectId: string): void {
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error(
      `Invalid projectId: "${projectId}". Expected format: proj_<alphanumeric> (e.g., "proj_abc123").`,
    );
  }
}

export function resolveCloudAuthContext(options: {
  projectId: string;
  sessionPath?: string;
}): CloudAuthContext {
  const sessionPath = options.sessionPath ?? join(homedir(), '.vertz', 'auth.json');

  // CI token takes precedence over developer session
  const envToken = process.env.VERTZ_CLOUD_TOKEN;
  if (envToken) {
    return { token: envToken, source: 'ci-token' };
  }

  // Try developer session file
  if (existsSync(sessionPath)) {
    try {
      const raw = readFileSync(sessionPath, 'utf-8');
      const data = JSON.parse(raw);

      if (!data.token || typeof data.token !== 'string') {
        throw new Error('missing token');
      }

      if (data.expiresAt && data.expiresAt < Date.now()) {
        throw new Error('expired');
      }

      return { token: data.token, source: 'developer-session' };
    } catch {
      throw new Error(
        `Cloud auth session expired or corrupted.\n\n  Run: vertz login\n  Session file: ${sessionPath}`,
      );
    }
  }

  // No auth context found
  throw new Error(
    `Cloud auth requires authentication. No developer session or CI token found.\n\nTo authenticate:\n  1. Run: vertz login\n  2. Or set VERTZ_CLOUD_TOKEN environment variable\n  3. For GitHub Actions, add the vertz-dev/cloud-auth action\n\nSession file expected at: ${sessionPath}`,
  );
}
