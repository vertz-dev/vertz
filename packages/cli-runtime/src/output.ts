import type { OutputFormat } from './types';

export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'table':
      return formatTable(data);
    case 'human':
      return formatHuman(data);
  }
}

function formatTable(data: unknown): string {
  if (data === null || data === undefined) {
    return String(data);
  }

  const rows = Array.isArray(data) ? data : [data];

  if (rows.length === 0) {
    return '(empty)';
  }

  // Collect all keys across all rows
  const keys = new Set<string>();
  for (const row of rows) {
    if (typeof row === 'object' && row !== null) {
      for (const key of Object.keys(row as Record<string, unknown>)) {
        keys.add(key);
      }
    }
  }

  const columns = Array.from(keys);
  if (columns.length === 0) {
    return String(data);
  }

  // Calculate column widths
  const widths = new Map<string, number>();
  for (const col of columns) {
    widths.set(col, col.length);
  }
  for (const row of rows) {
    if (typeof row === 'object' && row !== null) {
      const record = row as Record<string, unknown>;
      for (const col of columns) {
        const val = String(record[col] ?? '');
        const current = widths.get(col) ?? 0;
        widths.set(col, Math.max(current, val.length));
      }
    }
  }

  // Render header
  const header = columns.map((col) => col.padEnd(widths.get(col) ?? 0)).join('  ');
  const separator = columns.map((col) => '-'.repeat(widths.get(col) ?? 0)).join('  ');

  // Render rows
  const rowLines = rows.map((row) => {
    if (typeof row === 'object' && row !== null) {
      const record = row as Record<string, unknown>;
      return columns
        .map((col) => String(record[col] ?? '').padEnd(widths.get(col) ?? 0))
        .join('  ');
    }
    return String(row);
  });

  return [header, separator, ...rowLines].join('\n');
}

function formatHuman(data: unknown): string {
  if (data === null || data === undefined) {
    return String(data);
  }

  if (typeof data !== 'object') {
    return String(data);
  }

  if (Array.isArray(data)) {
    return data
      .map((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          const record = item as Record<string, unknown>;
          const fields = Object.entries(record)
            .map(([key, val]) => `  ${key}: ${String(val)}`)
            .join('\n');
          return `[${idx + 1}]\n${fields}`;
        }
        return `[${idx + 1}] ${String(item)}`;
      })
      .join('\n\n');
  }

  const record = data as Record<string, unknown>;
  return Object.entries(record)
    .map(([key, val]) => `${key}: ${String(val)}`)
    .join('\n');
}
