export interface CompilerConfig {
  sourceDir: string;
  outputDir: string;
  entryFile: string;
}

export interface DevConfig {
  port: number;
  host: string;
  open: boolean;
  typecheck: boolean;
}

export interface CLIConfig {
  strict: boolean;
  forceGenerate: boolean;
  compiler: CompilerConfig;
  dev: DevConfig;
  generators: Record<string, unknown>;
}

export interface UserCLIConfig {
  strict?: boolean;
  forceGenerate?: boolean;
  compiler?: Partial<CompilerConfig>;
  dev?: Partial<DevConfig>;
  generators?: Record<string, unknown>;
}

export function defineConfig(config: UserCLIConfig): UserCLIConfig {
  return config;
}

export const defaultCLIConfig: CLIConfig = {
  strict: false,
  forceGenerate: false,
  compiler: {
    sourceDir: 'src',
    outputDir: '.vertz/generated',
    entryFile: 'src/app.ts',
  },
  dev: {
    port: 3000,
    host: 'localhost',
    open: false,
    typecheck: true,
  },
  generators: {},
};
