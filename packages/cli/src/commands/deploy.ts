import { err, ok, type Result } from '@vertz/errors';
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

const VALID_TARGETS = new Set<string>(['fly', 'railway', 'docker']);

export function deployAction(options: DeployOptions): Result<{ files: GeneratedFile[] }, Error> {
  const { target, runtime, port } = options;

  if (!VALID_TARGETS.has(target)) {
    return err(
      new Error(`Unknown deploy target: "${target}". Valid targets: fly, railway, docker`),
    );
  }

  switch (target) {
    case 'railway':
      return ok({ files: generateRailwayConfig(runtime) });
    case 'fly':
      return ok({ files: generateFlyConfig(runtime, port) });
    case 'docker':
      return ok({ files: generateDockerConfig(runtime, port) });
  }
}
