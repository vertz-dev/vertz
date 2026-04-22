import { search, type DocsIndex, type SearchHit } from './search';

export interface GuideEntry {
  path: string;
  title: string;
  description?: string;
}

export interface DocsBundle {
  index: DocsIndex;
  contents: Record<string, string>;
  guides: GuideEntry[];
  examples: Record<string, string>;
}

export interface SearchDocsInput {
  query: string;
  limit?: number;
}

export interface SearchDocsResult {
  results: Array<SearchHit & { snippet: string }>;
}

export interface GetDocInput {
  path: string;
}

export interface GetDocResult {
  found: boolean;
  path: string;
  content: string;
}

export interface ListGuidesResult {
  guides: GuideEntry[];
}

export interface GetExampleInput {
  name: string;
}

export interface GetExampleResult {
  found: boolean;
  name: string;
  source: string;
}

const SNIPPET_LENGTH = 200;

function buildSnippet(content: string, query: string): string {
  if (!content) return '';
  const lower = content.toLowerCase();
  const firstTerm = query.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/)?.[0];
  let start = 0;
  if (firstTerm) {
    const idx = lower.indexOf(firstTerm);
    if (idx > 0) start = Math.max(0, idx - 60);
  }
  const slice = content.slice(start, start + SNIPPET_LENGTH).trim();
  return start > 0 ? `…${slice}` : slice;
}

export function searchDocs(bundle: DocsBundle, input: SearchDocsInput): SearchDocsResult {
  const limit = input.limit ?? 5;
  const hits = search(bundle.index, input.query, limit);
  return {
    results: hits.map((hit) => ({
      ...hit,
      snippet: buildSnippet(bundle.contents[hit.path] ?? '', input.query),
    })),
  };
}

function normalizePath(raw: string): string {
  let path = raw.trim();
  if (path.startsWith('/')) path = path.slice(1);
  if (path.endsWith('.mdx')) path = path.slice(0, -4);
  return path;
}

export function getDoc(bundle: DocsBundle, input: GetDocInput): GetDocResult {
  const path = normalizePath(input.path);
  const content = bundle.contents[path];
  if (content === undefined) {
    return { found: false, path, content: '' };
  }
  return { found: true, path, content };
}

export function listGuides(bundle: DocsBundle): ListGuidesResult {
  return { guides: bundle.guides };
}

export function getExample(bundle: DocsBundle, input: GetExampleInput): GetExampleResult {
  const name = input.name.trim();
  const source = bundle.examples[name];
  if (source === undefined) {
    return { found: false, name, source: '' };
  }
  return { found: true, name, source };
}
