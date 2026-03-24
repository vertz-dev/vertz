import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDocsConfig } from '../config/load';
import type { TocHeading } from '../mdx/extract-headings';
import { extractHeadings } from '../mdx/extract-headings';
import { mdxToMarkdown } from '../mdx/llm-markdown';
import { resolveRoutes } from '../routing/resolve';
import type { LlmPage } from './llm-index';
import { generateLlmsFullTxt, generateLlmsTxt } from './llm-index';

/** Options for the build pipeline. */
export interface BuildDocsOptions {
  projectDir: string;
  outDir: string;
  baseUrl?: string;
}

/** Route metadata in the output manifest. */
export interface ManifestRoute {
  path: string;
  title: string;
  filePath: string;
  tab: string;
  group: string;
  headings: TocHeading[];
}

/** The output manifest written to manifest.json. */
export interface BuildManifest {
  name: string;
  routes: ManifestRoute[];
}

/**
 * Build the docs site — generates LLM output, manifest, and page metadata.
 */
export async function buildDocs(options: BuildDocsOptions): Promise<BuildManifest> {
  const { projectDir, outDir, baseUrl = '' } = options;

  // Load config
  const config = await loadDocsConfig(projectDir);

  // Resolve routes
  const routes = resolveRoutes(config.sidebar);

  // Ensure output directory exists
  mkdirSync(outDir, { recursive: true });

  // Process each page
  const pagesDir = join(projectDir, 'pages');
  const manifestRoutes: ManifestRoute[] = [];
  const llmPages: LlmPage[] = [];

  for (const route of routes) {
    const filePath = join(pagesDir, route.filePath);
    if (!existsSync(filePath)) continue;

    const rawContent = await Bun.file(filePath).text();
    const headings = extractHeadings(rawContent);

    manifestRoutes.push({
      path: route.path,
      title: route.title,
      filePath: route.filePath,
      tab: route.tab,
      group: route.group,
      headings,
    });

    // Generate LLM markdown
    if (config.llm?.enabled) {
      const markdown = mdxToMarkdown(rawContent);
      llmPages.push({ path: route.path, title: route.title, markdown });

      const llmFilePath = toLlmOutputPath(route.path, outDir);
      mkdirSync(dirname(llmFilePath), { recursive: true });
      await Bun.write(llmFilePath, markdown);
    }
  }

  // Generate llms.txt and llms-full.txt
  if (config.llm?.enabled) {
    const llmConfig = config.llm;
    const llmsTxt = generateLlmsTxt(routes, llmConfig, baseUrl);
    await Bun.write(join(outDir, 'llms.txt'), llmsTxt);

    const llmsFullTxt = generateLlmsFullTxt(llmPages, llmConfig);
    await Bun.write(join(outDir, 'llms-full.txt'), llmsFullTxt);
  }

  // Write manifest
  const manifest: BuildManifest = {
    name: config.name,
    routes: manifestRoutes,
  };
  await Bun.write(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return manifest;
}

/** Convert a URL path to the LLM output file path. */
function toLlmOutputPath(urlPath: string, outDir: string): string {
  const fileName = urlPath === '/' ? 'home.md' : `${urlPath.slice(1)}.md`;
  return join(outDir, 'llms', fileName);
}
