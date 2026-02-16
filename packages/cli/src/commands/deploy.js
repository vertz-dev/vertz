import { generateDockerConfig } from '../deploy/dockerfile';
import { generateFlyConfig } from '../deploy/fly';
import { generateRailwayConfig } from '../deploy/railway';

const VALID_TARGETS = new Set(['fly', 'railway', 'docker']);
export function deployAction(options) {
  const { target, runtime, port } = options;
  if (!VALID_TARGETS.has(target)) {
    return {
      success: false,
      files: [],
      error: `Unknown deploy target: "${target}". Valid targets: fly, railway, docker`,
    };
  }
  switch (target) {
    case 'railway':
      return { success: true, files: generateRailwayConfig(runtime) };
    case 'fly':
      return { success: true, files: generateFlyConfig(runtime, port) };
    case 'docker':
      return { success: true, files: generateDockerConfig(runtime, port) };
  }
}
//# sourceMappingURL=deploy.js.map
