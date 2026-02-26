import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type AppType = 'api-only' | 'full-stack' | 'ui-only';

export interface DetectedApp {
  type: AppType;
  /** Absolute path to src/server.{ts,tsx,js} if found */
  serverEntry?: string;
  /** Absolute path to src/app.{tsx,ts} if found */
  uiEntry?: string;
  /** Absolute path to src/entry-server.ts if found (backward compat) */
  ssrEntry?: string;
  /** Absolute path to src/entry-client.ts if found */
  clientEntry?: string;
  /** The project root directory */
  projectRoot: string;
}

const SERVER_EXTENSIONS = ['.ts', '.tsx', '.js'] as const;
const APP_EXTENSIONS = ['.tsx', '.ts'] as const;

function findFile(dir: string, base: string, extensions: readonly string[]): string | undefined {
  for (const ext of extensions) {
    const filePath = join(dir, `${base}${ext}`);
    if (existsSync(filePath)) return filePath;
  }
  return undefined;
}

/**
 * Detect the app type by inspecting conventional file locations in src/.
 */
export function detectAppType(projectRoot: string): DetectedApp {
  const srcDir = join(projectRoot, 'src');

  const serverEntry = findFile(srcDir, 'server', SERVER_EXTENSIONS);
  const uiEntry = findFile(srcDir, 'app', APP_EXTENSIONS);
  const ssrEntry = existsSync(join(srcDir, 'entry-server.ts'))
    ? join(srcDir, 'entry-server.ts')
    : undefined;
  const clientEntry = existsSync(join(srcDir, 'entry-client.ts'))
    ? join(srcDir, 'entry-client.ts')
    : undefined;

  const hasServer = serverEntry !== undefined;
  const hasUI = uiEntry !== undefined || ssrEntry !== undefined;

  if (hasServer && hasUI) {
    return { type: 'full-stack', serverEntry, uiEntry, ssrEntry, clientEntry, projectRoot };
  }

  if (hasServer) {
    return { type: 'api-only', serverEntry, clientEntry, projectRoot };
  }

  if (hasUI) {
    return { type: 'ui-only', uiEntry, ssrEntry, clientEntry, projectRoot };
  }

  throw new Error(
    `No app entry found in ${srcDir}.\nExpected one of:\n  - src/server.ts (API server)\n  - src/app.tsx (UI application)\n  - src/entry-server.ts (custom SSR entry)`,
  );
}
