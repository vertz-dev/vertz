import type { LlmConfig } from '../config/types';
import type { PageRoute } from '../routing/resolve';

/**
 * Convert a URL path to the corresponding LLM markdown file path.
 * `/` → `home.md`, `/quickstart` → `quickstart.md`, `/guides/advanced` → `guides/advanced.md`
 */
function toLlmPath(urlPath: string): string {
  if (urlPath === '/') return 'home.md';
  return `${urlPath.slice(1)}.md`;
}

/**
 * Generate the `llms.txt` index file content.
 * Lists all documentation pages with links to their LLM-friendly markdown versions.
 */
export function generateLlmsTxt(routes: PageRoute[], config: LlmConfig, baseUrl: string): string {
  const lines: string[] = [];

  lines.push(`# ${config.title ?? 'Documentation'}`);
  if (config.description) {
    lines.push('');
    lines.push(config.description);
  }

  if (routes.length > 0) {
    lines.push('');
    for (const route of routes) {
      const llmPath = toLlmPath(route.path);
      lines.push(`- [${route.title}](${baseUrl}/llms/${llmPath})`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** A page with its rendered markdown content for full concatenation. */
export interface LlmPage {
  path: string;
  title: string;
  markdown: string;
}

/**
 * Generate the `llms-full.txt` file — all page content concatenated
 * into a single document.
 */
export function generateLlmsFullTxt(pages: LlmPage[], config: LlmConfig): string {
  const lines: string[] = [];

  lines.push(`# ${config.title ?? 'Documentation'}`);
  if (config.description) {
    lines.push('');
    lines.push(config.description);
  }

  for (const page of pages) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(page.markdown.trim());
  }

  lines.push('');
  return lines.join('\n');
}
