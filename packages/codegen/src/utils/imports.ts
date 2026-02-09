import type { Import } from '../types';

export function mergeImports(imports: Import[]): Import[] {
  const seen = new Map<string, Import>();
  for (const imp of imports) {
    const key = `${imp.from}::${imp.name}::${imp.isType}::${imp.alias ?? ''}`;
    if (!seen.has(key)) {
      seen.set(key, imp);
    }
  }
  return [...seen.values()].sort((a, b) => {
    const fromCmp = a.from.localeCompare(b.from);
    if (fromCmp !== 0) return fromCmp;
    return a.name.localeCompare(b.name);
  });
}

export function renderImports(imports: Import[]): string {
  const grouped = new Map<string, { types: string[]; values: string[] }>();

  for (const imp of imports) {
    let group = grouped.get(imp.from);
    if (!group) {
      group = { types: [], values: [] };
      grouped.set(imp.from, group);
    }
    const nameStr = imp.alias ? `${imp.name} as ${imp.alias}` : imp.name;
    if (imp.isType) {
      group.types.push(nameStr);
    } else {
      group.values.push(nameStr);
    }
  }

  const lines: string[] = [];
  for (const [from, group] of grouped) {
    if (group.types.length > 0) {
      lines.push(`import type { ${group.types.join(', ')} } from '${from}';`);
    }
    if (group.values.length > 0) {
      lines.push(`import { ${group.values.join(', ')} } from '${from}';`);
    }
  }

  return lines.join('\n');
}
