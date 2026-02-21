import type { CodegenConfig, CodegenIR, CodegenPipeline } from '@vertz/codegen';

export interface CodegenOptions {
  config: CodegenConfig | undefined;
  ir: CodegenIR;
  writeFile: (path: string, content: string) => Promise<void>;
  pipeline: CodegenPipeline;
  dryRun?: boolean;
  /** When false, disables incremental mode and always writes all files. Defaults to true. */
  incremental?: boolean;
}

export interface CodegenResult {
  success: boolean;
  output: string;
  fileCount: number;
}

export async function codegenAction(options: CodegenOptions): Promise<CodegenResult> {
  const { config, ir, writeFile, pipeline, dryRun = false, incremental = true } = options;

  // No codegen config provided
  if (!config) {
    return {
      success: false,
      output: 'No codegen configuration found. Add a codegen section to vertz.config.ts.',
      fileCount: 0,
    };
  }

  // Validate config
  const errors = pipeline.validate(config);
  if (errors.length > 0) {
    return {
      success: false,
      output: `Invalid codegen configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      fileCount: 0,
    };
  }

  // Generate files
  const result = pipeline.generate(ir, config);
  const outputDir = pipeline.resolveOutputDir(config);

  // Write files (unless dry-run)
  if (!dryRun) {
    try {
      for (const file of result.files) {
        const fullPath = `${outputDir}/${file.path}`;
        await writeFile(fullPath, file.content);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `Failed to write generated files: ${message}`,
        fileCount: 0,
      };
    }
  }

  // Build output message
  const inc = incremental ? result.incremental : undefined;
  let output: string;

  if (inc) {
    const parts: string[] = [];
    if (inc.written.length > 0) {
      parts.push(`${inc.written.length} written`);
    }
    if (inc.skipped.length > 0) {
      parts.push(`${inc.skipped.length} skipped`);
    }
    if (inc.removed.length > 0) {
      parts.push(`${inc.removed.length} removed`);
    }
    const details = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    output = `Generated ${result.fileCount} file${result.fileCount === 1 ? '' : 's'}${details} (${result.generators.join(', ')})`;
  } else {
    output = `Generated ${result.fileCount} file${result.fileCount === 1 ? '' : 's'} (${result.generators.join(', ')})`;
  }

  return {
    success: true,
    output,
    fileCount: result.fileCount,
  };
}
