import type { ParsedSpec } from '../parser/types';
import { generateClient } from './client-generator';
import { generateResources } from './resource-generator';
import { generateSchemas } from './schema-generator';
import type { GeneratedFile, GenerateOptions } from './types';
import { generateTypes } from './types-generator';

/**
 * Generate all SDK files from a parsed spec.
 */
export function generateAll(spec: ParsedSpec, options?: GenerateOptions): GeneratedFile[] {
  const { resources, schemas } = spec;
  const opts = { schemas: false, baseURL: '', ...options };
  const files: GeneratedFile[] = [];

  // Types
  files.push(...generateTypes(resources, schemas));

  // Resources
  files.push(...generateResources(resources));

  // Client
  files.push(generateClient(resources, { baseURL: opts.baseURL }));

  // Schemas (opt-in)
  if (opts.schemas) {
    files.push(...generateSchemas(resources, schemas));
  }

  // README
  files.push(generateReadme(spec, opts));

  return files;
}

function generateReadme(spec: ParsedSpec, options: GenerateOptions): GeneratedFile {
  const lines: string[] = [];

  lines.push(`# ${spec.info.title} SDK`);
  lines.push('');
  lines.push(`> Auto-generated from OpenAPI ${spec.version} spec (v${spec.info.version})`);
  lines.push('');
  lines.push('## Usage');
  lines.push('');
  lines.push('```typescript');
  lines.push("import { createClient } from './client';");
  lines.push('');
  lines.push(
    `const api = createClient(${options.baseURL ? `{ baseURL: '${options.baseURL}' }` : ''});`,
  );
  lines.push('```');
  lines.push('');

  lines.push('## Resources');
  lines.push('');
  for (const r of spec.resources) {
    lines.push(`### ${r.name}`);
    lines.push('');
    for (const op of r.operations) {
      lines.push(`- \`api.${r.identifier}.${op.methodName}()\` — ${op.method} ${op.path}`);
    }
    lines.push('');
  }

  lines.push('## Committing');
  lines.push('');
  lines.push('We recommend committing generated code to source control.');
  lines.push('This ensures your CI builds work without running the generator.');
  lines.push('');
  lines.push('## Regenerating');
  lines.push('');
  lines.push('```bash');
  lines.push('npx @vertz/openapi generate');
  lines.push('```');
  lines.push('');

  return { path: 'README.md', content: lines.join('\n') };
}

export type { GeneratedFile, GenerateOptions } from './types';
