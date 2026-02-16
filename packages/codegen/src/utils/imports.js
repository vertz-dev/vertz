export function mergeImports(imports) {
  const seen = new Map();
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
export function renderImports(imports) {
  const grouped = new Map();
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
  const lines = [];
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
//# sourceMappingURL=imports.js.map
