import { join } from 'node:path';

export type DeployTarget = 'fly' | 'railway' | 'docker';

const DETECTION_ORDER: Array<{ file: string; target: DeployTarget }> = [
  { file: 'fly.toml', target: 'fly' },
  { file: 'railway.toml', target: 'railway' },
  { file: 'Dockerfile', target: 'docker' },
];

export function detectTarget(
  projectRoot: string,
  existsFn: (path: string) => boolean,
): DeployTarget | null {
  for (const { file, target } of DETECTION_ORDER) {
    if (existsFn(join(projectRoot, file))) {
      return target;
    }
  }
  return null;
}
