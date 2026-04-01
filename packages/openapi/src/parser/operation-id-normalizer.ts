import type { HttpMethod } from './types';

export interface NormalizerConfig {
  overrides?: Record<string, string>;
  transform?: (cleaned: string, original: string) => string;
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

export function normalizeOperationId(
  operationId: string,
  method: HttpMethod,
  path: string,
  config?: NormalizerConfig,
): string {
  if (config?.overrides?.[operationId]) {
    return config.overrides[operationId];
  }

  const cleaned = autoCleanOperationId(operationId, path);

  if (config?.transform) {
    return config.transform(cleaned, operationId);
  }

  return detectCrudMethod(method, path) ?? cleaned;
}
