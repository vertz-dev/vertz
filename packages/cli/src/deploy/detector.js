import { join } from 'node:path';

const DETECTION_ORDER = [
  { file: 'fly.toml', target: 'fly' },
  { file: 'railway.toml', target: 'railway' },
  { file: 'Dockerfile', target: 'docker' },
];
export function detectTarget(projectRoot, existsFn) {
  for (const { file, target } of DETECTION_ORDER) {
    if (existsFn(join(projectRoot, file))) {
      return target;
    }
  }
  return null;
}
//# sourceMappingURL=detector.js.map
