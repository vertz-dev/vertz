import { resolve } from 'node:path';
import { err, ok, type Result } from '@vertz/errors';

export interface DocsInitCommandOptions {
  dir?: string;
}

export interface DocsBuildCommandOptions {
  output?: string;
  baseUrl?: string;
}

export interface DocsCheckCommandOptions {
  dir?: string;
}

export interface DocsDevCommandOptions {
  port?: number;
  host?: string;
}

/**
 * CLI action: scaffold a new docs project.
 */
export async function docsInitCommand(
  options: DocsInitCommandOptions = {},
): Promise<Result<void, Error>> {
  try {
    const { docsInitAction } = await import('@vertz/docs');
    const projectDir = resolve(process.cwd(), options.dir ?? '.');
    const result = await docsInitAction({ projectDir });
    if (!result.ok) {
      return err(result.error);
    }
    console.log('Docs project initialized successfully.');
    console.log('  Created vertz.config.ts');
    console.log('  Created pages/index.mdx');
    console.log('  Created pages/quickstart.mdx');
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * CLI action: validate docs site integrity.
 */
export async function docsCheckCommand(
  options: DocsCheckCommandOptions = {},
): Promise<Result<void, Error>> {
  try {
    const { docsCheckAction } = await import('@vertz/docs');
    const projectDir = resolve(process.cwd(), options.dir ?? '.');
    const result = await docsCheckAction({ projectDir });
    if (!result.ok) {
      return err(result.error);
    }

    const { errors, warnings, stats } = result.data;

    for (const diagnostic of errors) {
      console.error(`\u2717 ${diagnostic.message}`);
    }
    for (const diagnostic of warnings) {
      console.warn(`\u26A0 ${diagnostic.message}`);
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log(
        `\u2713 All checks passed (${stats.pages} pages, ${stats.internalLinks} internal links checked).`,
      );
    } else {
      console.log(`\nFound ${errors.length} error(s), ${warnings.length} warning(s).`);
    }

    if (errors.length > 0) {
      return err(new Error(`Docs check found ${errors.length} error(s).`));
    }

    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * CLI action: build docs for production.
 */
export async function docsBuildCommand(
  options: DocsBuildCommandOptions = {},
): Promise<Result<void, Error>> {
  try {
    const { docsBuildAction } = await import('@vertz/docs');
    const projectDir = process.cwd();
    const result = await docsBuildAction({
      projectDir,
      outputDir: options.output ? resolve(projectDir, options.output) : undefined,
      baseUrl: options.baseUrl,
    });
    if (!result.ok) {
      return err(result.error);
    }
    console.log('Docs built successfully.');
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * CLI action: start docs dev server.
 */
export async function docsDevCommand(
  options: DocsDevCommandOptions = {},
): Promise<Result<void, Error>> {
  const { port = 3001, host = 'localhost' } = options;

  try {
    const { docsDevAction } = await import('@vertz/docs');
    const projectDir = process.cwd();

    const result = await docsDevAction({ projectDir, port, host });
    if (!result.ok) {
      return err(result.error);
    }

    const server = result.data;
    console.log(`Docs dev server running at http://${server.hostname}:${server.port}`);

    // Keep the process alive until interrupted
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => {
        server.stop();
        resolve();
      });
      process.once('SIGTERM', () => {
        server.stop();
        resolve();
      });
    });

    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
