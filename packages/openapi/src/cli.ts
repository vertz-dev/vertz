import { loadConfigFile, resolveConfig } from './config';
import type { OpenAPIConfig } from './config';
import { generateFromOpenAPI } from './generate';
import { loadSpec } from './loader';
import { parseOpenAPI } from './parser/openapi-parser';

export interface CLIResult {
  exitCode: number;
  message: string;
}

function parseArgs(args: string[]): { command: string; flags: Record<string, string | boolean> } {
  const command = args[0] ?? '';
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return { command, flags };
}

function flagsToPartialConfig(
  flags: Record<string, string | boolean>,
): Partial<OpenAPIConfig> & { from?: string; dryRun?: boolean } {
  const result: Partial<OpenAPIConfig> & { from?: string; dryRun?: boolean } = {};

  if (typeof flags.from === 'string') result.from = flags.from;
  if (typeof flags.output === 'string') result.output = flags.output;
  if (typeof flags['base-url'] === 'string') result.baseURL = flags['base-url'];
  if (typeof flags['group-by'] === 'string') {
    const value = flags['group-by'];
    if (value === 'tag' || value === 'path' || value === 'none') {
      result.groupBy = value;
    }
  }
  if (flags.schemas === true) result.schemas = true;
  if (typeof flags['exclude-tags'] === 'string') {
    result.excludeTags = flags['exclude-tags'].split(',').map((t) => t.trim());
  }
  if (flags['dry-run'] === true) result.dryRun = true;

  return result;
}

async function handleGenerate(
  flags: Record<string, string | boolean>,
  cwd: string,
): Promise<CLIResult> {
  const cliFlags = flagsToPartialConfig(flags);
  const configFile = await loadConfigFile(cwd);

  let config: OpenAPIConfig & { dryRun?: boolean };
  try {
    const resolved = resolveConfig(cliFlags, configFile);
    config = { ...resolved, dryRun: cliFlags.dryRun };
  } catch (err) {
    return {
      exitCode: 1,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    const result = await generateFromOpenAPI(config);

    if (config.dryRun) {
      return {
        exitCode: 0,
        message: `Generated ${result.written + result.skipped} files (dry run) — ${result.written} would be written, ${result.skipped} unchanged`,
      };
    }

    const parts: string[] = [];
    parts.push(`Generated ${result.written + result.skipped} files in ${config.output}`);
    parts.push(`${result.written} written`);
    if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);
    if (result.removed > 0) parts.push(`${result.removed} removed`);

    return {
      exitCode: 0,
      message: parts.join(', '),
    };
  } catch (err) {
    return {
      exitCode: 1,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function handleValidate(flags: Record<string, string | boolean>): Promise<CLIResult> {
  const source = typeof flags.from === 'string' ? flags.from : undefined;
  if (!source) {
    return {
      exitCode: 1,
      message: 'Error: Missing --from flag for validate command',
    };
  }

  try {
    const raw = await loadSpec(source);
    const parsed = parseOpenAPI(raw);
    return {
      exitCode: 0,
      message: `Spec is valid — OpenAPI ${parsed.version}, ${parsed.operations.length} operations`,
    };
  } catch (err) {
    return {
      exitCode: 1,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Run the CLI with the given arguments.
 * Returns a result with exit code and message (for testability).
 */
export async function runCLI(args: string[], cwd?: string): Promise<CLIResult> {
  const { command, flags } = parseArgs(args);

  if (!command) {
    return {
      exitCode: 1,
      message: 'Usage: @vertz/openapi <generate|validate> [options]',
    };
  }

  if (command === 'generate') {
    return handleGenerate(flags, cwd ?? process.cwd());
  }

  if (command === 'validate') {
    return handleValidate(flags);
  }

  return {
    exitCode: 1,
    message: `Unknown command: ${command}. Use "generate" or "validate".`,
  };
}
