import { promises as fs } from 'node:fs';
import path from 'node:path';
import { compose } from './features/compose.js';
import { resolveFeatures } from './features/registry.js';
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
 * Scaffolds a new Vertz project using the composable feature engine.
 * @param parentDir - Parent directory where the project will be created
 * @param options - Scaffold options
 */
export async function scaffold(parentDir: string, options: ScaffoldOptions): Promise<void> {
  const { projectName, template, withFeatures } = options;
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

  // Resolve features from template preset or --with flag
  const features = withFeatures
    ? resolveFeatures({ withFeatures })
    : resolveFeatures({ template });

  // Compose all features
  const result = compose(projectName, features);

  // Build package.json
  const pkg: Record<string, unknown> = {
    name: projectName,
    version: '0.1.0',
    type: 'module',
    license: 'MIT',
    scripts: result.packageJson.scripts,
  };

  if (result.packageJson.imports) {
    pkg.imports = result.packageJson.imports;
  }

  pkg.dependencies = result.packageJson.dependencies;
  pkg.devDependencies = result.packageJson.devDependencies;

  // Collect all file entries including package.json
  const allFiles = [
    { path: 'package.json', content: JSON.stringify(pkg, null, 2) },
    ...result.files,
  ];

  // Create directories and write files
  const dirs = new Set<string>();
  for (const file of allFiles) {
    const dir = path.dirname(path.join(projectDir, file.path));
    dirs.add(dir);
  }

  await Promise.all([...dirs].map((dir) => fs.mkdir(dir, { recursive: true })));

  await Promise.all(
    allFiles.map((file) =>
      fs.writeFile(path.join(projectDir, file.path), file.content, 'utf-8'),
    ),
  );
}
