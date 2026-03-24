import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '@vertz/errors';
import { createDocsDevServer, type DocsDevServer } from '../dev/docs-dev-server';
import { buildDocs } from '../generator/build-pipeline';
import { initDocs } from './init';

export interface DocsInitOptions {
  projectDir: string;
}

export interface DocsBuildOptions {
  projectDir: string;
  outputDir?: string;
  baseUrl?: string;
}

/**
 * CLI action: scaffold a new docs project.
 */
export async function docsInitAction(options: DocsInitOptions): Promise<Result<void, Error>> {
  try {
    if (!existsSync(options.projectDir)) {
      return err(new Error(`Directory does not exist: ${options.projectDir}`));
    }
    await initDocs(options.projectDir);
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * CLI action: build the docs site.
 */
export async function docsBuildAction(options: DocsBuildOptions): Promise<Result<void, Error>> {
  try {
    const outDir = options.outputDir ?? join(options.projectDir, 'dist');
    await buildDocs({
      projectDir: options.projectDir,
      outDir,
      baseUrl: options.baseUrl,
    });
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export interface DocsDevOptions {
  projectDir: string;
  port?: number;
  host?: string;
}

/**
 * CLI action: start the docs development server.
 */
export async function docsDevAction(
  options: DocsDevOptions,
): Promise<Result<DocsDevServer, Error>> {
  try {
    if (!existsSync(options.projectDir)) {
      return err(new Error(`Directory does not exist: ${options.projectDir}`));
    }
    const server = await createDocsDevServer({
      projectDir: options.projectDir,
      port: options.port,
      host: options.host,
    });
    return ok(server);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
