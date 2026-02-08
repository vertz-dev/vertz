import type { GeneratedFile } from '../config/defaults';

export function generateRailwayConfig(runtime: 'bun' | 'node'): GeneratedFile[] {
  const isBun = runtime === 'bun';
  const buildCmd = isBun ? 'bun run build' : 'npm run build';
  const startCmd = isBun ? 'bun run start' : 'node dist/index.js';

  const content = `[build]
buildCommand = "${buildCmd}"

[deploy]
startCommand = "${startCmd}"
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
`;

  return [{ path: 'railway.toml', content }];
}
