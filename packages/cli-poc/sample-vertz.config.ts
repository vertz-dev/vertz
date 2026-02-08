/**
 * Sample vertz.config.ts for config loading spike.
 */

interface VertzConfig {
  strict?: boolean;
  forceGenerate?: boolean;
  compiler?: {
    sourceDir?: string;
    outputDir?: string;
    entryFile?: string;
  };
  dev?: {
    port?: number;
    host?: string;
  };
}

function defineConfig(config: VertzConfig): VertzConfig {
  return config;
}

export default defineConfig({
  strict: true,
  compiler: {
    sourceDir: "src",
    outputDir: "dist/generated",
    entryFile: "src/main.ts",
  },
  dev: {
    port: 4000,
    host: "0.0.0.0",
  },
});
