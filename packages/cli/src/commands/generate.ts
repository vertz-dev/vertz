import type { GeneratedFile } from '../config/defaults';
import { generateModule } from '../generators/module';
import { generateRouter } from '../generators/router';
import { generateSchema } from '../generators/schema';
import { generateService } from '../generators/service';

export interface GenerateOptions {
  type: string;
  name: string;
  module?: string;
  sourceDir: string;
  dryRun?: boolean;
}

export type GenerateResult =
  | { success: true; files: GeneratedFile[] }
  | { success: false; files: GeneratedFile[]; error: string };

const REQUIRES_MODULE = new Set(['service', 'router', 'schema']);

export function generateAction(options: GenerateOptions): GenerateResult {
  const { type, name, module: moduleName, sourceDir } = options;

  if (REQUIRES_MODULE.has(type) && !moduleName) {
    return {
      success: false,
      files: [],
      error: `Generator "${type}" requires a --module option`,
    };
  }

  // At this point, if type requires a module, moduleName is guaranteed to be defined
  const ensuredModuleName = moduleName as string;

  switch (type) {
    case 'module':
      return { success: true, files: generateModule(name, sourceDir) };
    case 'service':
      return { success: true, files: generateService(name, ensuredModuleName, sourceDir) };
    case 'router':
      return { success: true, files: generateRouter(name, ensuredModuleName, sourceDir) };
    case 'schema':
      return { success: true, files: generateSchema(name, ensuredModuleName, sourceDir) };
    default:
      return {
        success: false,
        files: [],
        error: `Unknown generator type: "${type}"`,
      };
  }
}
