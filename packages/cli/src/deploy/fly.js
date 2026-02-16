import { generateDockerConfig } from './dockerfile';
export function generateFlyConfig(runtime, port) {
  const flyToml = `app = "my-vertz-app"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = ${port}
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/health"
  timeout = "5s"
`;
  const dockerFiles = generateDockerConfig(runtime, port);
  return [{ path: 'fly.toml', content: flyToml }, ...dockerFiles];
}
//# sourceMappingURL=fly.js.map
