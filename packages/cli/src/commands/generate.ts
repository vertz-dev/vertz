import { err, ok, type Result } from '@vertz/errors';
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

const REQUIRES_MODULE = new Set(['service', 'router', 'schema']);

export function generateAction(
  options: GenerateOptions,
): Result<{ files: GeneratedFile[] }, Error> {
  const { type, name, module: moduleName, sourceDir } = options;

  if (REQUIRES_MODULE.has(type) && !moduleName) {
    return err(new Error(`Generator "${type}" requires a --module option`));
  }

  // At this point, if type requires a module, moduleName is guaranteed to be defined
  const ensuredModuleName = moduleName as string;

  switch (type) {
    case 'module':
      return ok({ files: generateModule(name, sourceDir) });
    case 'service':
      return ok({ files: generateService(name, ensuredModuleName, sourceDir) });
    case 'router':
      return ok({ files: generateRouter(name, ensuredModuleName, sourceDir) });
    case 'schema':
      return ok({ files: generateSchema(name, ensuredModuleName, sourceDir) });
    default:
      return err(new Error(`Unknown generator type: "${type}"`));
  }
}
