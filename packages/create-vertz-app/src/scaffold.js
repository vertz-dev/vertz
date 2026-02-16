import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  appTemplate,
  denoConfigTemplate,
  envExampleTemplate,
  envSrcTemplate,
  envTemplate,
  gitignoreTemplate,
  healthCheckSchemaTemplate,
  healthModuleDefTemplate,
  healthModuleTemplate,
  healthRouterTemplate,
  healthServiceTemplate,
  mainTemplate,
  packageJsonTemplate,
  requestIdMiddlewareTemplate,
  tsconfigTemplate,
  vertzConfigTemplate,
} from './templates/index.js';
/**
 * Error thrown when the project directory already exists
 */
export class DirectoryExistsError extends Error {
  constructor(projectName) {
    super(`Directory "${projectName}" already exists`);
    this.name = 'DirectoryExistsError';
  }
}
/**
 * Scaffolds a new Vertz project
 * @param parentDir - Parent directory where the project will be created
 * @param options - Scaffold options
 */
export async function scaffold(parentDir, options) {
  const { projectName, runtime, includeExample } = options;
  const projectDir = path.join(parentDir, projectName);
  // Check if directory already exists
  try {
    await fs.access(projectDir);
    throw new DirectoryExistsError(projectName);
  } catch (err) {
    if (err instanceof DirectoryExistsError) {
      throw err;
    }
    // Directory doesn't exist, which is what we want
  }
  // Create project directory
  await fs.mkdir(projectDir, { recursive: true });
  // Create subdirectories
  const srcDir = path.join(projectDir, 'src');
  const modulesDir = path.join(srcDir, 'modules');
  const middlewaresDir = path.join(srcDir, 'middlewares');
  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(modulesDir, { recursive: true });
  await fs.mkdir(middlewaresDir, { recursive: true });
  // Generate and write core config files
  await writeFile(
    projectDir,
    'package.json',
    packageJsonTemplate({ projectName, runtime, includeExample }),
  );
  await writeFile(projectDir, 'tsconfig.json', tsconfigTemplate(runtime));
  await writeFile(projectDir, 'vertz.config.ts', vertzConfigTemplate());
  await writeFile(projectDir, '.env', envTemplate());
  await writeFile(projectDir, '.env.example', envExampleTemplate());
  await writeFile(projectDir, '.gitignore', gitignoreTemplate());
  // Generate Deno-specific config if needed
  if (runtime === 'deno') {
    await writeFile(projectDir, 'deno.json', denoConfigTemplate());
  }
  // Generate source files
  await writeFile(srcDir, 'env.ts', envSrcTemplate());
  await writeFile(srcDir, 'app.ts', appTemplate());
  await writeFile(srcDir, 'main.ts', mainTemplate());
  await writeFile(middlewaresDir, 'request-id.middleware.ts', requestIdMiddlewareTemplate());
  // Generate example health module if requested
  if (includeExample) {
    const schemasDir = path.join(modulesDir, 'schemas');
    await fs.mkdir(schemasDir, { recursive: true });
    await writeFile(modulesDir, 'health.module-def.ts', healthModuleDefTemplate());
    await writeFile(modulesDir, 'health.module.ts', healthModuleTemplate());
    await writeFile(modulesDir, 'health.service.ts', healthServiceTemplate());
    await writeFile(modulesDir, 'health.router.ts', healthRouterTemplate());
    await writeFile(schemasDir, 'health-check.schema.ts', healthCheckSchemaTemplate());
  }
}
/**
 * Helper to write a file with consistent formatting
 */
async function writeFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
}
//# sourceMappingURL=scaffold.js.map
