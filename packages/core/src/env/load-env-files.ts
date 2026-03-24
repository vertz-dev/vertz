import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnvFile } from './parse-env-file';

export function loadEnvFiles(filePaths: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const filePath of filePaths) {
    const resolved = resolve(filePath);
    try {
      const content = readFileSync(resolved, 'utf-8');
      Object.assign(result, parseEnvFile(content));
    } catch {
      // File doesn't exist — skip silently (.env.local may not exist in CI)
    }
  }

  return result;
}
