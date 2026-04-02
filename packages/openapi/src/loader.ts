import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseYAML } from 'yaml';

class LoaderError extends Error {
  override name = 'LoaderError';
}

/**
 * Load an OpenAPI spec from a file path or URL.
 * Auto-detects JSON vs YAML from file extension or content.
 */
export async function loadSpec(source: string): Promise<Record<string, unknown>> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return loadFromURL(source);
  }
  return loadFromFile(source);
}

function loadFromFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new LoaderError(`Spec file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return parseAsYAML(content, filePath);
  }

  if (ext === '.json') {
    return parseAsJSON(content, filePath);
  }

  // Auto-detect: try JSON first if content starts with {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('{')) {
    return parseAsJSON(content, filePath);
  }

  // Fallback: try YAML
  return parseAsYAML(content, filePath);
}

async function loadFromURL(url: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await globalThis.fetch(url);
  } catch (err) {
    throw new LoaderError(
      `Failed to fetch spec from ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new LoaderError(`Failed to fetch spec from ${url}: HTTP ${response.status}`);
  }

  const content = await response.text();

  // Detect YAML from URL extension or content
  const urlPath = new URL(url).pathname;
  const ext = extname(urlPath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return parseAsYAML(content, url);
  }

  if (ext === '.json') {
    return parseAsJSON(content, url);
  }

  // Auto-detect from content
  const trimmed = content.trimStart();
  if (trimmed.startsWith('{')) {
    return parseAsJSON(content, url);
  }

  return parseAsYAML(content, url);
}

function parseAsJSON(content: string, source: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new LoaderError(`Failed to parse ${source}: expected an object`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof LoaderError) throw err;
    throw new LoaderError(
      `Failed to parse JSON from ${source}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function parseAsYAML(content: string, source: string): Record<string, unknown> {
  try {
    const parsed = parseYAML(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new LoaderError(`Failed to parse ${source}: expected an object`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof LoaderError) throw err;
    throw new LoaderError(
      `Failed to parse YAML from ${source}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
