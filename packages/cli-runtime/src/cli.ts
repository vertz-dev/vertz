import type { CLIConfig } from './types';

export function createCLI(_config: CLIConfig): { run: (argv: string[]) => Promise<void> } {
  return {
    async run(_argv: string[]): Promise<void> {
      // stub
    },
  };
}
