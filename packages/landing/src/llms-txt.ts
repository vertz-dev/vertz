/**
 * llms.txt content for vertz.dev
 *
 * Serves as an LLM-friendly entry point that provides a concise overview
 * of the Vertz framework and links to full documentation.
 */
export const LLMS_TXT = `# Vertz

> Full-stack TypeScript framework where types flow from database to browser. Define your schema once — get a typed database layer, API, and compiled UI.

## Docs

- [Quickstart](https://docs.vertz.dev/quickstart)
- [Installation](https://docs.vertz.dev/installation)
- [LLM Quick Reference](https://docs.vertz.dev/guides/llm-quick-reference)
- [Full Docs (LLM-optimized)](https://docs.vertz.dev/llms-full.txt)

## Quick Start

\`\`\`bash
vtz create vertz my-app
cd my-app
vtz install
vtz dev
\`\`\`

## Templates

- \`todo-app\` (default): Full-stack app with database, API, entities, and UI
- \`hello-world\`: UI-only counter app — minimal starting point

## Key Concepts

- **Schema**: \`d.table()\` and \`d.model()\` define your data shape (\`vertz/db\`)
- **Entities**: \`entity()\` generates typed CRUD endpoints under \`/api/\` (\`vertz/server\`)
- **Routes**: All endpoints mount under \`/api/\` by default (e.g. \`GET /api/tasks\`, \`POST /api/tasks\`)
- **UI**: Compiler-driven reactivity — \`let\` becomes signals, \`const\` becomes computed (\`vertz/ui\`)
- **One dependency**: \`vtz add vertz\` — meta-package includes all framework packages

## Stack

| Layer      | Package        | Purpose                              |
|------------|----------------|--------------------------------------|
| Schema     | vertz/schema   | Validation schemas (Zod-compatible)  |
| Database   | vertz/db       | Type-safe tables, models, migrations |
| Server     | vertz/server   | Entities, CRUD, auth, codegen        |
| UI         | vertz/ui       | Compiled reactive UI with JSX        |
| Theme      | @vertz/theme-shadcn | Shadcn-inspired component theme |

## Source Code

- [GitHub](https://github.com/vertz-dev/vertz)
- [Documentation](https://docs.vertz.dev)
`;
