import type { PromptAdapter } from './resolver';
import type { CLIConfig } from './types';
export interface CLIRuntime {
  run: (argv: string[]) => Promise<void>;
}
export interface CLIOptions {
  output?: (text: string) => void;
  errorOutput?: (text: string) => void;
  promptAdapter?: PromptAdapter;
  baseURL?: string;
}
export declare function createCLI(config: CLIConfig, options?: CLIOptions): CLIRuntime;
//# sourceMappingURL=cli.d.ts.map
