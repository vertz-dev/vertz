import { readFileSync, writeFileSync } from 'node:fs';
import { rewriteSource } from './rewriter';

const filePath = process.argv[2];
if (!filePath) {
  console.error('usage: migrate-templates.ts <file>');
  process.exit(2);
}

const source = readFileSync(filePath, 'utf8');

const templateLiteralPattern = /return `([\s\S]*?)`;(\s*\})/g;

let output = '';
let cursor = 0;
let changed = 0;

for (const match of source.matchAll(templateLiteralPattern)) {
  const [whole, inner] = match;
  const idx = match.index ?? 0;
  output += source.slice(cursor, idx);
  cursor = idx + whole.length;

  const migrated = migrateTemplateLiteral(inner);
  if (migrated === inner) {
    output += whole;
    continue;
  }
  changed++;
  output += `return \`${migrated}\`;${match[2]}`;
}
output += source.slice(cursor);

writeFileSync(filePath, output);
console.log(`migrated ${changed} template literals in ${filePath}`);

function migrateTemplateLiteral(inner: string): string {
  const unescaped = inner.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
  let transformed: string;
  try {
    const result = rewriteSource(unescaped, 'synthetic.tsx');
    if (!result.changed) return inner;
    transformed = result.code;
  } catch (err) {
    console.error(`  skipping template: ${err instanceof Error ? err.message : err}`);
    return inner;
  }

  const tokenUsed = /\btoken\./.test(transformed) && !/\btoken\./.test(unescaped);
  if (tokenUsed) {
    transformed = mergeTokenIntoVertzUiImport(transformed);
  }
  return transformed.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * rewriteSource inserts `import { token } from '@vertz/ui';` when token is used.
 * Template strings use `'vertz/ui'` as the module specifier. Strip the inserted
 * `@vertz/ui` line and merge `token` into the existing `'vertz/ui'` import.
 */
function mergeTokenIntoVertzUiImport(code: string): string {
  const insertedImportRegex = /^import \{ token \} from '@vertz\/ui';\n?/m;
  const stripped = code.replace(insertedImportRegex, '');

  const vertzUiImportRegex = /import \{([\s\S]*?)\} from 'vertz\/ui';/g;
  const matches = [...stripped.matchAll(vertzUiImportRegex)];
  if (matches.length === 0) {
    return stripped;
  }

  const first = matches[0];
  const inner = first[1];
  const names = inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.includes('token')) return stripped;
  const updated = [...names, 'token'].sort();

  const isMultiline = inner.includes('\n');
  const newClause = isMultiline
    ? `import {\n  ${updated.join(',\n  ')},\n} from 'vertz/ui';`
    : `import { ${updated.join(', ')} } from 'vertz/ui';`;

  return (
    stripped.slice(0, first.index) +
    newClause +
    stripped.slice((first.index ?? 0) + first[0].length)
  );
}
