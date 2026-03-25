import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_TEMPLATE = `import { defineDocsConfig } from '@vertz/docs';

export default defineDocsConfig({
  name: 'My Docs',
  sidebar: [
    {
      tab: 'Documentation',
      groups: [
        {
          title: 'Getting Started',
          pages: ['index.mdx', 'quickstart.mdx'],
        },
      ],
    },
  ],
});
`;

const INDEX_TEMPLATE = `---
title: Welcome
description: Getting started with the documentation
---

# Welcome

Welcome to the documentation. Edit \`pages/index.mdx\` to get started.

## Features

- MDX-powered pages
- Full-text search
- Dark mode support
- LLM-friendly output
`;

const QUICKSTART_TEMPLATE = `---
title: Quickstart
description: Get up and running quickly
---

# Quickstart

## Installation

\`\`\`bash
bun add @vertz/docs
\`\`\`

## Create your first page

Create a \`pages/\` directory and add \`.mdx\` files:

\`\`\`
my-docs/
  pages/
    index.mdx
    quickstart.mdx
  vertz.config.ts
\`\`\`

## Start the dev server

\`\`\`bash
vertz docs dev
\`\`\`
`;

/**
 * Initialize a new docs project in the given directory.
 * Creates config file and starter pages without overwriting existing files.
 */
export async function initDocs(projectDir: string): Promise<void> {
  const pagesDir = join(projectDir, 'pages');
  mkdirSync(pagesDir, { recursive: true });

  const configPath = join(projectDir, 'vertz.config.ts');
  if (!existsSync(configPath)) {
    await Bun.write(configPath, CONFIG_TEMPLATE);
  }

  const indexPath = join(pagesDir, 'index.mdx');
  if (!existsSync(indexPath)) {
    await Bun.write(indexPath, INDEX_TEMPLATE);
  }

  const quickstartPath = join(pagesDir, 'quickstart.mdx');
  if (!existsSync(quickstartPath)) {
    await Bun.write(quickstartPath, QUICKSTART_TEMPLATE);
  }
}
