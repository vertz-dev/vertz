import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  apiClientTemplate,
  appComponentTemplate,
  dbTemplate,
  entryClientTemplate,
  envExampleTemplate,
  envTemplate,
  gitignoreTemplate,
  homePageTemplate,
  packageJsonTemplate,
  schemaTemplate,
  serverTemplate,
  tasksEntityTemplate,
  themeTemplate,
  tsconfigTemplate,
  vertzConfigTemplate,
} from './templates/index.js';
import type { ScaffoldOptions } from './types.js';

/**
 * Error thrown when the project directory already exists
 */
export class DirectoryExistsError extends Error {
  constructor(projectName: string) {
    super(`Directory "${projectName}" already exists`);
    this.name = 'DirectoryExistsError';
  }
}

/**
 * Scaffolds a new Vertz project
 * @param parentDir - Parent directory where the project will be created
 * @param options - Scaffold options
 */
export async function scaffold(parentDir: string, options: ScaffoldOptions): Promise<void> {
  const { projectName } = options;
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

  // Create project directory and subdirectories
  const srcDir = path.join(projectDir, 'src');
  const apiDir = path.join(srcDir, 'api');
  const entitiesDir = path.join(apiDir, 'entities');
  const pagesDir = path.join(srcDir, 'pages');
  const stylesDir = path.join(srcDir, 'styles');

  await Promise.all([
    fs.mkdir(entitiesDir, { recursive: true }),
    fs.mkdir(pagesDir, { recursive: true }),
    fs.mkdir(stylesDir, { recursive: true }),
  ]);

  // Write all files in parallel
  await Promise.all([
    // Config files
    writeFile(projectDir, 'package.json', packageJsonTemplate(projectName)),
    writeFile(projectDir, 'tsconfig.json', tsconfigTemplate()),
    writeFile(projectDir, 'vertz.config.ts', vertzConfigTemplate()),
    writeFile(projectDir, '.env', envTemplate()),
    writeFile(projectDir, '.env.example', envExampleTemplate()),
    writeFile(projectDir, '.gitignore', gitignoreTemplate()),

    // API source files
    writeFile(apiDir, 'server.ts', serverTemplate()),
    writeFile(apiDir, 'schema.ts', schemaTemplate()),
    writeFile(apiDir, 'db.ts', dbTemplate()),
    writeFile(apiDir, 'client.ts', apiClientTemplate()),
    writeFile(entitiesDir, 'tasks.entity.ts', tasksEntityTemplate()),

    // UI source files
    writeFile(srcDir, 'app.tsx', appComponentTemplate()),
    writeFile(srcDir, 'entry-client.ts', entryClientTemplate()),
    writeFile(pagesDir, 'home.tsx', homePageTemplate()),
    writeFile(stylesDir, 'theme.ts', themeTemplate()),
  ]);
}

/**
 * Helper to write a file with consistent formatting
 */
async function writeFile(dir: string, filename: string, content: string): Promise<void> {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
}
