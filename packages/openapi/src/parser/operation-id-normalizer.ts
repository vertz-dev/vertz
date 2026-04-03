import type { HttpMethod } from './types';

export interface OperationContext {
  /** Raw operationId from the spec */
  operationId: string;
  /** HTTP method (GET, POST, etc.) */
  method: HttpMethod;
  /** Route path (e.g. /v1/tasks/{id}) */
  path: string;
  /** Tags from the operation */
  tags: string[];
  /** Whether the operation has a request body */
  hasBody: boolean;
}

export interface NormalizerConfig {
  overrides?: Record<string, string>;
  transform?: (cleaned: string, context: OperationContext) => string;
}

const HTTP_METHOD_WORDS = new Set(['get', 'post', 'put', 'delete', 'patch']);

function isPathParam(segment: string): boolean {
  return segment.startsWith('{') && segment.endsWith('}');
}

function getPathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function toCamelCase(words: string[]): string {
  if (words.length === 0) {
    return '';
  }

  const [first = '', ...rest] = words.map((word) => word.toLowerCase());
  return first + rest.map((word) => word[0]?.toUpperCase() + word.slice(1)).join('');
}

function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 3) {
    return `${word.slice(0, -3)}y`;
  }

  if (word.endsWith('s') && word.length > 1) {
    return word.slice(0, -1);
  }

  return word;
}

function getPrimaryResourceWords(path: string): string[] {
  const segments = getPathSegments(path).filter((segment) => !isPathParam(segment));
  const firstSegment = segments[0];

  if (!firstSegment) {
    return [];
  }

  return splitWords(firstSegment).map((word) => word.toLowerCase());
}

function autoCleanOperationId(operationId: string, path: string): string {
  const withoutControllerPrefix = operationId.replace(/^[A-Za-z0-9]+Controller[_.-]+/, '');
  const words = splitWords(withoutControllerPrefix).map((word) => word.toLowerCase());

  const lastWord = words.at(-1);
  if (words.length > 1 && lastWord && HTTP_METHOD_WORDS.has(lastWord)) {
    words.pop();
  }

  const resourcePhrase = getPrimaryResourceWords(path);
  const resourceWords = new Set([...resourcePhrase, ...resourcePhrase.map(singularize)]);

  if (resourcePhrase.length === 1) {
    while (words.length > 1 && words[0] && resourceWords.has(words[0])) {
      words.shift();
    }

    while (words.length > 1 && words.at(-1) && resourceWords.has(words.at(-1) as string)) {
      words.pop();
    }
  }

  return toCamelCase(words);
}

function detectCrudMethod(method: HttpMethod, path: string): string | undefined {
  const segments = getPathSegments(path);

  if (segments.length === 1 && method === 'GET') {
    return 'list';
  }

  if (segments.length === 2 && segments[1] && isPathParam(segments[1])) {
    if (method === 'GET') {
      return 'get';
    }

    if (method === 'PUT' || method === 'PATCH') {
      return 'update';
    }

    if (method === 'DELETE') {
      return 'delete';
    }
  }

  if (segments.length === 1 && method === 'POST') {
    return 'create';
  }

  return undefined;
}

/**
 * Derive a short, readable PascalCase prefix for generated type names.
 *
 * Many spec generators (FastAPI, etc.) produce operationIds that embed the full
 * URL path: `list_brand_competitors_web_brand_id_competitors_get`. This strips
 * trailing HTTP method words and the path-derived suffix to produce a shorter
 * name like `ListBrandCompetitors`.
 */
export function deriveTypePrefix(operationId: string, path: string): string {
  const withoutController = operationId.replace(/^[A-Za-z0-9]+Controller[_.-]+/, '');
  const words = splitWords(withoutController).map((w) => w.toLowerCase());

  // Strip trailing HTTP method word
  if (words.length > 1 && words.at(-1) && HTTP_METHOD_WORDS.has(words.at(-1) as string)) {
    words.pop();
  }

  // Build ordered list of path-derived words
  const pathWordList: string[] = [];
  for (const segment of getPathSegments(path)) {
    const name = isPathParam(segment) ? segment.slice(1, -1) : segment;
    for (const w of splitWords(name)) {
      pathWordList.push(w.toLowerCase());
    }
  }

  // Find the longest suffix of `words` that matches a contiguous subsequence
  // of path words (in order). This detects where the path embedding starts.
  // Only strip if at least 2 meaningful words remain (avoid reducing to just a verb).
  const cutIndex = findPathSuffixStart(words, pathWordList);
  const meaningful = cutIndex >= 2 ? words.slice(0, cutIndex) : words;

  return meaningful.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/**
 * Find the earliest index in `words` where a contiguous suffix matches
 * a subsequence of `pathWords` in order. Returns that index, or words.length
 * if no path suffix is found.
 */
function findPathSuffixStart(words: string[], pathWords: string[]): number {
  if (pathWords.length === 0) return words.length;

  // Try progressively earlier start positions for the suffix
  for (let start = 1; start < words.length; start++) {
    if (isSuffixMatchingPath(words, start, pathWords)) {
      return start;
    }
  }

  return words.length;
}

/**
 * Check if words[start..] can be matched as a subsequence of pathWords.
 * Each word in the suffix must appear in pathWords in order.
 */
function isSuffixMatchingPath(words: string[], start: number, pathWords: string[]): boolean {
  let pathIdx = 0;
  for (let i = start; i < words.length; i++) {
    // Find this word in the remaining pathWords
    let found = false;
    while (pathIdx < pathWords.length) {
      if (words[i] === pathWords[pathIdx]) {
        pathIdx++;
        found = true;
        break;
      }
      pathIdx++;
    }
    if (!found) return false;
  }
  return true;
}

export function normalizeOperationId(
  operationId: string,
  method: HttpMethod,
  path: string,
  config?: NormalizerConfig,
  context?: OperationContext,
): string {
  if (config?.overrides?.[operationId]) {
    return config.overrides[operationId];
  }

  const cleaned = autoCleanOperationId(operationId, path);

  if (config?.transform) {
    const ctx: OperationContext = context ?? {
      operationId,
      method,
      path,
      tags: [],
      hasBody: false,
    };
    return config.transform(cleaned, ctx);
  }

  return detectCrudMethod(method, path) ?? cleaned;
}
