import type { GeneratedFile } from '../config/defaults';
import type { DeployTarget } from '../deploy/detector';
import { generateDockerConfig } from '../deploy/dockerfile';
import { generateFlyConfig } from '../deploy/fly';
import { generateRailwayConfig } from '../deploy/railway';

export interface DeployOptions {
  target: DeployTarget;
  runtime: 'bun' | 'node';
  port: number;
  projectRoot: string;
  dryRun?: boolean;
}

export type DeployResult =
  | { success: true; files: GeneratedFile[] }
  | { success: false; files: GeneratedFile[]; error: string };

const VALID_TARGETS = new Set<string>(['fly', 'railway', 'docker']);

export function deployAction(options: DeployOptions): DeployResult {
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
