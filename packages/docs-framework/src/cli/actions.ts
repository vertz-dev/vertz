import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildDocs } from '../generator/build-pipeline';
import { initDocs } from './init';

type Result<T> = { ok: true; data: T } | { ok: false; error: Error };

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
export async function docsInitAction(options: DocsInitOptions): Promise<Result<void>> {
  try {
    if (!existsSync(options.projectDir)) {
      return { ok: false, error: new Error(`Directory does not exist: ${options.projectDir}`) };
    }
    await initDocs(options.projectDir);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * CLI action: build the docs site.
 */
export async function docsBuildAction(options: DocsBuildOptions): Promise<Result<void>> {
  try {
    const outDir = options.outputDir ?? join(options.projectDir, 'dist');
    await buildDocs({
      projectDir: options.projectDir,
      outDir,
      baseUrl: options.baseUrl,
    });
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
