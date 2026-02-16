export function generateRailwayConfig(runtime) {
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
//# sourceMappingURL=railway.js.map
