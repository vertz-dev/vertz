import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, type DocsIndex } from '../src/search';

export interface GuideEntry {
  path: string;
  title: string;
  description?: string;
}

export interface BuildResult {
  index: DocsIndex;
  contents: Record<string, string>;
  guides: GuideEntry[];
  examples: Record<string, string>;
}

interface ParsedDoc {
  path: string;
  title: string;
  description?: string;
  body: string;
  source: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

function parseFrontmatter(source: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = source.match(FRONTMATTER_RE);
  if (!match) return { data: {}, body: source };
  const block = match[1] ?? '';
  const data: Record<string, string> = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: source.slice(match[0].length) };
}

async function* walkMdx(
  dir: string,
  root: string,
  excludeDirs: ReadonlySet<string>,
): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.has(full)) continue;
      yield* walkMdx(full, root, excludeDirs);
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      yield relative(root, full);
    }
  }
}

function pathToId(relPath: string): string {
  return relPath
    .replace(/\.mdx$/, '')
    .split(/[\\/]/)
    .join('/');
}

async function readDocs(root: string, excludeDirs: ReadonlySet<string>): Promise<ParsedDoc[]> {
  const docs: ParsedDoc[] = [];
  for await (const relPath of walkMdx(root, root, excludeDirs)) {
    const source = await readFile(join(root, relPath), 'utf8');
    const { data, body } = parseFrontmatter(source);
    const id = pathToId(relPath);
    const title = data['title'] ?? id;
    const doc: ParsedDoc = {
      path: id,
      title,
      body,
      source,
    };
    if (data['description']) doc.description = data['description'];
    docs.push(doc);
  }
  return docs;
}

async function readExamples(root: string): Promise<Record<string, string>> {
  const examples: Record<string, string> = {};
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.mdx')) {
        const name = entry.name.replace(/\.mdx$/, '');
        examples[name] = await readFile(join(root, entry.name), 'utf8');
      }
    }
  } catch {
    // examples dir is optional
  }
  return examples;
}

export async function buildDocsIndex(
  docsRoot: string,
  options: { examplesDir?: string } = {},
): Promise<BuildResult> {
  const excludeDirs = new Set<string>();
  if (options.examplesDir) excludeDirs.add(resolve(options.examplesDir));
  const docs = await readDocs(docsRoot, excludeDirs);

  const sources = docs.map((d) => ({
    id: d.path,
    title: d.title,
    path: d.path,
    body: d.body,
  }));
  const index = buildIndex(sources);

  const contents: Record<string, string> = {};
  const guides: GuideEntry[] = [];
  for (const doc of docs) {
    contents[doc.path] = doc.body.trim();
    const guide: GuideEntry = { path: doc.path, title: doc.title };
    if (doc.description) guide.description = doc.description;
    guides.push(guide);
  }
  guides.sort((a, b) => a.path.localeCompare(b.path));

  const examples = options.examplesDir ? await readExamples(options.examplesDir) : {};

  return { index, contents, guides, examples };
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const docsRoot = resolve(here, '../../mint-docs');
  const examplesDir = resolve(docsRoot, 'examples');
  const distDir = resolve(here, '../dist');
  const outFile = resolve(distDir, 'docs-index.generated.json');

  await mkdir(distDir, { recursive: true });
  const result = await buildDocsIndex(docsRoot, { examplesDir });
  await writeFile(outFile, `${JSON.stringify(result)}\n`, 'utf8');
  console.log(
    `Wrote ${outFile} — ${result.index.docs.length} docs, ${
      Object.keys(result.examples).length
    } examples`,
  );
}

if (import.meta.main) {
  await main();
}
