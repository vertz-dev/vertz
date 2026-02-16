import type { GeneratedFile } from '../config/defaults';
import type { DeployTarget } from '../deploy/detector';
export interface DeployOptions {
  target: DeployTarget;
  runtime: 'bun' | 'node';
  port: number;
  projectRoot: string;
  dryRun?: boolean;
}
export type DeployResult =
  | {
      success: true;
      files: GeneratedFile[];
    }
  | {
      success: false;
      files: GeneratedFile[];
      error: string;
    };
export declare function deployAction(options: DeployOptions): DeployResult;
//# sourceMappingURL=deploy.d.ts.map
