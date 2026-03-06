/**
 * Generates src/generated-icons.ts from lucide-static.
 *
 * Each lucide-static string export becomes a named function:
 *   export function MoonIcon(props?: IconProps): HTMLSpanElement { ... }
 *
 * The generated file inlines all SVG strings — no runtime dependency on lucide-static.
 * Run: `bun run generate`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as icons from 'lucide-static';

const HEADER = '// AUTO-GENERATED — DO NOT EDIT. Run `bun run generate` to regenerate.\n';

export function generateIconSource(): string {
  const entries = Object.entries(icons)
    .filter(([key, value]) => key !== 'default' && typeof value === 'string')
    .sort(([a], [b]) => a.localeCompare(b));

  const lines: string[] = [
    HEADER,
    "import { renderIcon } from './render-icon';",
    "import type { IconProps } from './types';",
    '',
  ];

  for (const [name, svg] of entries) {
    const escaped = (svg as string).replace(/`/g, '\\`').replace(/\$/g, '\\$');
    lines.push(`export function ${name}Icon(props?: IconProps): HTMLSpanElement {`);
    lines.push(`  return renderIcon(`);
    lines.push(`    \`${escaped}\`,`);
    lines.push('    props,');
    lines.push('  );');
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

// Run when executed directly
const outputPath = path.resolve(__dirname, '../src/generated-icons.ts');
const source = generateIconSource();
fs.writeFileSync(outputPath, source);

const iconCount = Object.keys(icons).filter(
  (k) => k !== 'default' && typeof (icons as Record<string, unknown>)[k] === 'string',
).length;
console.log(`Generated ${outputPath} with ${iconCount} icons`);
