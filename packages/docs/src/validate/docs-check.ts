import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocsConfig } from '../config/types';
import { parseFrontmatter } from '../mdx/frontmatter';
import { resolveRoutes } from '../routing/resolve';

/** A single diagnostic from the docs check. */
export interface DocsCheckDiagnostic {
  type: 'broken-sidebar-ref' | 'broken-internal-link' | 'missing-frontmatter';
  severity: 'error' | 'warning';
  message: string;
  /** The sidebar page entry or MDX file path causing the issue. */
  source: string;
  /** For links: the broken href. For sidebar: the missing file path. */
  target?: string;
}

/** Result of running docs validation. */
export interface DocsCheckResult {
  errors: DocsCheckDiagnostic[];
  warnings: DocsCheckDiagnostic[];
  stats: { pages: number; internalLinks: number };
}

/**
 * Regex for extracting internal markdown links.
 * Matches [text](/path) but not ![image](/path).
 * Handles title attributes: [text](/path "title") — captures only the path.
 */
const INTERNAL_LINK_RE = /(?<!!)\[([^\]]+)\]\(\/((?:[^)\s])+)[^)]*\)/g;

/**
 * Normalize a sidebar page entry to a file path.
 * If the entry already ends with `.mdx`, use as-is. Otherwise append `.mdx`.
 */
function toFilePath(page: string): string {
  return page.endsWith('.mdx') ? page : `${page}.mdx`;
}

/**
 * Normalize a sidebar page entry for use as the `source` field in diagnostics.
 * Strips `.mdx` extension if present.
 */
function toSourceId(page: string): string {
  return page.replace(/\.mdx$/, '');
}

/**
 * Extract internal links from MDX content, skipping code blocks.
 * Returns an array of unique (target path, original href) pairs.
 */
function extractInternalLinks(content: string): string[] {
  const lines = content.split('\n');
  let inCodeBlock = false;
  const seen = new Set<string>();
  const links: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    let match: RegExpExecArray | null;
    INTERNAL_LINK_RE.lastIndex = 0;
    while ((match = INTERNAL_LINK_RE.exec(line)) !== null) {
      const rawPath = match[2] ?? '';
      // Normalize: strip anchor and query string
      const basePath = `/${rawPath.split('#')[0]!.split('?')[0]!}`;
      if (!seen.has(basePath)) {
        seen.add(basePath);
        links.push(basePath);
      }
    }
  }

  return links;
}

/**
 * Validate a docs project configuration and pages directory.
 * Pure validation function — does not load config from disk.
 */
export function validateDocs(config: DocsConfig, pagesDir: string): DocsCheckResult {
  const errors: DocsCheckDiagnostic[] = [];
  const warnings: DocsCheckDiagnostic[] = [];
  let pageCount = 0;
  let internalLinkCount = 0;

  const routes = resolveRoutes(config.sidebar);

  // Build a set of known URL paths for link validation
  const knownPaths = new Set<string>(routes.map((r) => r.path));

  // Collect all sidebar page entries for iteration
  const sidebarPages: { page: string; tab: string; group: string }[] = [];
  for (const tab of config.sidebar) {
    for (const group of tab.groups) {
      for (const page of group.pages) {
        sidebarPages.push({ page, tab: tab.tab, group: group.title });
      }
    }
  }

  for (const { page, tab, group } of sidebarPages) {
    const filePath = join(pagesDir, toFilePath(page));
    const sourceId = toSourceId(page);

    // 1. Validate sidebar ref — does the file exist?
    if (!existsSync(filePath)) {
      errors.push({
        type: 'broken-sidebar-ref',
        severity: 'error',
        message: `Broken sidebar reference: "${sourceId}" (tab: ${tab}, group: ${group})\n  File not found: ${toFilePath(page)}`,
        source: sourceId,
        target: toFilePath(page),
      });
      continue; // Can't check content of a missing file
    }

    pageCount++;

    // Read page content
    const rawContent = readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content: bodyContent } = parseFrontmatter(rawContent);

    // 2. Validate frontmatter — warn if description is missing
    if (!frontmatter.description) {
      warnings.push({
        type: 'missing-frontmatter',
        severity: 'warning',
        message: `Missing frontmatter "description" in ${toFilePath(page)}`,
        source: sourceId,
      });
    }

    // 3. Validate internal links
    const links = extractInternalLinks(bodyContent);
    internalLinkCount += links.length;

    for (const linkPath of links) {
      if (!knownPaths.has(linkPath)) {
        errors.push({
          type: 'broken-internal-link',
          severity: 'error',
          message: `Broken internal link in ${toFilePath(page)}:\n  [...]( ${linkPath}) → no page matches ${linkPath}`,
          source: sourceId,
          target: linkPath,
        });
      }
    }
  }

  return {
    errors,
    warnings,
    stats: { pages: pageCount, internalLinks: internalLinkCount },
  };
}
