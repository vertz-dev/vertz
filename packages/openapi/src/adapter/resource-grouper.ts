import { sanitizeIdentifier } from './identifier';
import type { ParsedOperation, ParsedResource } from '../parser/types';

export type GroupByStrategy = 'tag' | 'path' | 'none';

export interface GroupOptions {
  excludeTags?: string[];
}

function getPathGroupKey(path: string): string {
  const meaningfulSegments = path
    .split('/')
    .filter(Boolean)
    .filter((segment) => segment !== 'api')
    .filter((segment) => !/^v\d+$/i.test(segment))
    .filter((segment) => !(segment.startsWith('{') && segment.endsWith('}')));

  return meaningfulSegments[meaningfulSegments.length - 1] ?? '_ungrouped';
}

function toResourceName(identifier: string): string {
  return identifier === '_ungrouped'
    ? 'Ungrouped'
    : identifier.charAt(0).toUpperCase() + identifier.slice(1);
}

export function groupOperations(
  operations: ParsedOperation[],
  strategy: GroupByStrategy,
  options?: GroupOptions,
): ParsedResource[] {
  const excludeSet = options?.excludeTags ? new Set(options.excludeTags) : undefined;
  const resources = new Map<string, ParsedOperation[]>();

  for (const operation of operations) {
    // Skip operations where any tag matches excludeTags
    if (excludeSet && operation.tags.some((t) => excludeSet.has(t))) {
      continue;
    }

    const groupKey =
      strategy === 'tag'
        ? (operation.tags[0] ?? '_ungrouped')
        : strategy === 'none'
          ? operation.operationId
          : getPathGroupKey(operation.path);
    const identifier = groupKey === '_ungrouped' ? '_ungrouped' : sanitizeIdentifier(groupKey);
    const existing = resources.get(identifier) ?? [];
    existing.push(operation);
    resources.set(identifier, existing);
  }

  return [...resources.entries()].map(([identifier, resourceOperations]) => ({
    name: toResourceName(identifier),
    identifier,
    operations: resourceOperations,
  }));
}
