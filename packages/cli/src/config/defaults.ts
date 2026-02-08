import type { CompilerConfig } from '@vertz/compiler';

export interface DevConfig {
  port: number;
  host: string;
  open: boolean;
  typecheck: boolean;
}

export interface CLIConfig {
  strict: boolean;
  forceGenerate: boolean;
  compiler: Partial<CompilerConfig>;
  dev: DevConfig;
  generators: string[];
}

export const defaultCLIConfig: CLIConfig = {
  strict: false,
  forceGenerate: false,
  compiler: {
    sourceDir: 'src',
    entryFile: 'src/app.ts',
    outputDir: '.vertz/generated',
  },
  dev: {
    port: 3000,
    host: 'localhost',
    open: false,
    typecheck: true,
  },
  generators: [],
};
