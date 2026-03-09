/**
 * Pre-generates syntax-highlighted token data using Shiki (Oniguruma engine).
 *
 * Run: bun sites/landing/scripts/generate-highlights.ts
 *
 * Output: sites/landing/src/components/highlighted-code.ts
 *
 * This keeps Shiki + its WASM binary out of the client bundle — only compact
 * token tuples ship to the browser (or are rendered at SSR time).
 *
 * Token format:
 *   [style, content]                — plain token
 *   [style, content, hintLines]     — token with a type-hint tooltip
 *
 * hintLines is also Shiki-highlighted: [style, content][][] (lines of tokens).
 */
import { createHighlighter } from 'shiki';

// ---------- code snippets ----------

const CODE_COUNTER = `import { css } from 'vertz/ui';

const styles = css({
  button: ['px:4', 'py:2', 'rounded:md', 'bg:blue-600', 'text:white']
});

export function Counter() {
  let count = 0;

  return (
    <button class={styles.button} onClick={() => count++}>
      Clicked {count} times
    </button>
  );
}`;

const CODE_PROFILE = `import { query } from 'vertz/ui';
import { api } from './sdk';

export function UserProfile({ userId }: { userId: string }) {
  const {data, error, loading} = query(api.users.read(userId));

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
    </div>
  );
}`;

const CODE_FORM = `import { form } from 'vertz/ui';
import { api } from './sdk';

const loginForm = form(api.users.login, {
  onSuccess: () => redirect('/dashboard')
});

return (
  <form onSubmit={loginForm.onSubmit}>
    <input name="email" placeholder="Email" />
    <input name="password" type="password" />
    <button type="submit" disabled={loginForm.submitting}>Sign in</button>
  </form>
);`;

const CODE_CSS = `import { variants } from 'vertz/ui';

const button = variants({
  base: ['rounded:md', 'font:semibold'],
  variants: {
    intent: {
      primary: ['bg:blue-600', 'text:white'],
      ghost: ['hover:bg:surface', 'text:zinc-300']
    },
    size: {
      sm: ['px:3', 'py:1.5', 'text:sm'],
      md: ['px:4', 'py:2', 'text:base']
    }
  }
});

// Usage: button({ intent: 'primary', size: 'md' })`;

// ---------- full-stack flow snippets ----------

const CODE_SCHEMA = `import { d } from '@vertz/db';

const users = d.table('users', {
  id:    d.uuid().primary({ generate: 'uuid' }),
  name:  d.text(),
  email: d.email().unique(),
});

const todos = d.table('todos', {
  id:     d.uuid().primary({ generate: 'uuid' }),
  title:  d.text(),
  done:   d.boolean().default(false),
  userId: d.uuid(),
});

export const todosModel = d.model(todos, {
  user: d.ref.one(() => users, 'userId'),
});`;

const CODE_ENTITY = `import { entity } from '@vertz/server';
import { todosModel } from './schema';

export const todos = entity('todos', {
  model: todosModel,
  access: {
    list:   (ctx) => ctx.authenticated(),
    create: (ctx) => ctx.authenticated(),
    update: (ctx, row) => ctx.userId === row.userId,
    delete: (ctx, row) => ctx.userId === row.userId,
  },
  before: {
    create: (data, ctx) => ({ ...data, userId: ctx.userId }),
  },
});
// GET  /api/todos     — auto-generated
// POST /api/todos     — auto-generated
// GET  /api/openapi   — auto-generated`;

const CODE_UI_FLOW = `import { query, form } from '@vertz/ui';
import { api } from './generated/client';

export function TodoList() {
  const todos = query(api.todos.list());
  const todoForm = form(api.todos.create, {
    onSuccess: () => todos.refetch(),
  });

  return (
    <form onSubmit={todoForm.onSubmit}>
      <input name="title" placeholder="What needs to be done?" />
      <button type="submit">Add</button>
      {todos.data.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </form>
  );
}`;

// ---------- glue-code section snippets ----------

const CODE_GLUE_SCHEMA = `// schema.ts — define it once
const todos = d.table('todos', {
  id:    d.uuid().primary(),
  title: d.text(),
  done:  d.boolean().default(false),
});`;

const CODE_GLUE_UI = `// TodoList.tsx — use it everywhere
const todos = query(api.todos.list());
const todoForm = form(api.todos.create);`;

// ---------- type-error-demo section snippets ----------

const CODE_DIFF_SCHEMA = `const todos = d.table('todos', {
  id:   d.uuid().primary(),
  title: d.text(),
  name:  d.text(),
  done:  d.boolean().default(false),
});`;

const CODE_ERROR_API = `api.todos.create({ title: 'Buy milk' });`;

const CODE_ERROR_UI_RENDER = `<li>{t.title}</li>`;

// ---------- type hint definitions ----------
// Each hint maps: line (0-based) + token content → TypeScript type signature

interface HintDef {
  line: number;
  match: string;
  hint: string;
}

const HINTS_COUNTER: HintDef[] = [
  { line: 2, match: 'css', hint: 'function css(config: CSSConfig): Record<string, string>' },
  { line: 7, match: 'count', hint: 'let count: number  // reactive signal' },
];

const HINTS_PROFILE: HintDef[] = [
  {
    line: 4,
    match: 'query',
    hint: 'function query<T>(\n  thenable: Promise<T>\n): QueryResult<T>',
  },
  {
    line: 4,
    match: '{data, error, loading}',
    hint: 'const data: User\nconst error: Error | null\nconst loading: boolean',
  },
];

const HINTS_FORM: HintDef[] = [
  {
    line: 3,
    match: 'form',
    hint: 'function form<T>(\n  action: Action<T>,\n  opts?: FormOptions\n): FormState<T>',
  },
  { line: 3, match: 'loginForm', hint: 'const loginForm: FormState<LoginResponse>' },
];

const HINTS_CSS: HintDef[] = [
  {
    line: 2,
    match: 'variants',
    hint: 'function variants(config: VariantsConfig): (\n  props: { intent: "primary" | "ghost"; size: "sm" | "md" }\n) => string',
  },
];

const HINTS_SCHEMA: HintDef[] = [
  {
    line: 2,
    match: 'd',
    hint: 'import d from "@vertz/db"  // schema builder',
  },
  {
    line: 16,
    match: 'one',
    hint: 'd.ref.one(() => targetTable, foreignKey)\n// todos.userId → users.id',
  },
  { line: 15, match: 'todosModel', hint: 'const todosModel: Model<TodosTable>' },
];

const HINTS_ENTITY: HintDef[] = [
  {
    line: 3,
    match: 'entity',
    hint: 'function entity<T>(name: string, config: EntityConfig<T>): Entity<T>',
  },
  {
    line: 6,
    match: 'authenticated',
    hint: 'ctx.authenticated(): boolean\n// Returns true if the request has a valid session.',
  },
  {
    line: 8,
    match: 'userId',
    hint: 'ctx.userId: string | null\n// The authenticated user\'s ID.\n// Row-level ownership check.',
  },
  {
    line: 12,
    match: 'create',
    hint: 'before.create(data, ctx) => data\n// Stamps the current userId onto new rows.',
  },
];

const HINTS_UI_FLOW: HintDef[] = [
  {
    line: 4,
    match: 'query',
    hint: 'function query<T>(\n  thenable: Promise<T>\n): QueryResult<T>',
  },
  {
    line: 5,
    match: 'form',
    hint: 'function form<T>(\n  action: Action<T>,\n  opts?: FormOptions\n): FormState<T>',
  },
];

// ---------- font style bitmask → CSS ----------

const FONT_STYLE_CSS: Record<number, string> = {
  1: 'font-style:italic',
  2: 'font-weight:bold',
  4: 'text-decoration:underline',
};

function fontStyleToCSS(fontStyle: number): string {
  const parts: string[] = [];
  for (const [bit, css] of Object.entries(FONT_STYLE_CSS)) {
    if (fontStyle & Number(bit)) parts.push(css);
  }
  return parts.join(';');
}

// ---------- types ----------

type CompactToken = [string, string]; // [style, content]
type HintedToken = [string, string, CompactToken[][]]; // [style, content, hintLines]
type Token = CompactToken | HintedToken;
type TokenLine = Token[];

// ---------- main ----------

async function main() {
  const highlighter = await createHighlighter({
    themes: ['dracula'],
    langs: ['tsx'],
  });

  function highlightCode(code: string): CompactToken[][] {
    const { tokens } = highlighter.codeToTokens(code, {
      lang: 'tsx',
      theme: 'dracula',
    });

    return tokens.map((line) =>
      line.map((token): CompactToken => {
        const parts: string[] = [];
        if (token.color) parts.push(`color:${token.color}`);
        if (token.fontStyle) {
          const fs = fontStyleToCSS(token.fontStyle);
          if (fs) parts.push(fs);
        }
        return [parts.join(';'), token.content];
      }),
    );
  }

  function highlightHint(hint: string): CompactToken[][] {
    return highlightCode(hint);
  }

  function applyHints(lines: CompactToken[][], hints: HintDef[]): TokenLine[] {
    // Index hints by line for fast lookup
    const hintsByLine = new Map<number, HintDef[]>();
    for (const h of hints) {
      const existing = hintsByLine.get(h.line) ?? [];
      existing.push(h);
      hintsByLine.set(h.line, existing);
    }

    return lines.map((line, lineIdx): TokenLine => {
      const lineHints = hintsByLine.get(lineIdx);
      if (!lineHints) return line;

      return line.map((token): Token => {
        const content = token[1].trim();
        const match = lineHints.find((h) => h.match === content);
        if (!match) return token;

        const hintTokens = highlightHint(match.hint);
        return [token[0], token[1], hintTokens];
      });
    });
  }

  const counterLines = highlightCode(CODE_COUNTER);
  const profileLines = highlightCode(CODE_PROFILE);
  const formLines = highlightCode(CODE_FORM);
  const cssLines = highlightCode(CODE_CSS);
  const schemaLines = highlightCode(CODE_SCHEMA);
  const entityLines = highlightCode(CODE_ENTITY);
  const uiFlowLines = highlightCode(CODE_UI_FLOW);
  const glueSchemaLines = highlightCode(CODE_GLUE_SCHEMA);
  const glueUiLines = highlightCode(CODE_GLUE_UI);
  const diffSchemaLines = highlightCode(CODE_DIFF_SCHEMA);
  const errorApiLines = highlightCode(CODE_ERROR_API);
  const errorUiRenderLines = highlightCode(CODE_ERROR_UI_RENDER);

  const data = {
    counter: applyHints(counterLines, HINTS_COUNTER),
    profile: applyHints(profileLines, HINTS_PROFILE),
    form: applyHints(formLines, HINTS_FORM),
    css: applyHints(cssLines, HINTS_CSS),
    schema: applyHints(schemaLines, HINTS_SCHEMA),
    entity: applyHints(entityLines, HINTS_ENTITY),
    uiFlow: applyHints(uiFlowLines, HINTS_UI_FLOW),
    glueSchema: glueSchemaLines,
    glueUi: glueUiLines,
    diffSchema: diffSchemaLines,
    errorApi: errorApiLines,
    errorUiRender: errorUiRenderLines,
  };

  const output = `// AUTO-GENERATED by scripts/generate-highlights.ts — do not edit manually.
// Re-generate: bun sites/landing/scripts/generate-highlights.ts

/**
 * Token format:
 *   [style, content]              — plain token
 *   [style, content, hintLines]   — token with type-hint tooltip
 *
 * hintLines: [style, content][][] — Shiki-highlighted type hint (lines of tokens).
 */

export type CompactToken = [string, string];
export type HintedToken = [string, string, CompactToken[][]];
export type Token = CompactToken | HintedToken;
export type TokenLine = Token[];

export const TOKENS_COUNTER: TokenLine[] = ${JSON.stringify(data.counter)};

export const TOKENS_PROFILE: TokenLine[] = ${JSON.stringify(data.profile)};

export const TOKENS_FORM: TokenLine[] = ${JSON.stringify(data.form)};

export const TOKENS_CSS: TokenLine[] = ${JSON.stringify(data.css)};

export const TOKENS_SCHEMA: TokenLine[] = ${JSON.stringify(data.schema)};

export const TOKENS_ENTITY: TokenLine[] = ${JSON.stringify(data.entity)};

export const TOKENS_UI: TokenLine[] = ${JSON.stringify(data.uiFlow)};

export const TOKENS_GLUE_SCHEMA: TokenLine[] = ${JSON.stringify(data.glueSchema)};

export const TOKENS_GLUE_UI: TokenLine[] = ${JSON.stringify(data.glueUi)};

export const TOKENS_DIFF_SCHEMA: TokenLine[] = ${JSON.stringify(data.diffSchema)};

export const TOKENS_ERROR_API: TokenLine[] = ${JSON.stringify(data.errorApi)};

export const TOKENS_ERROR_UI_RENDER: TokenLine[] = ${JSON.stringify(data.errorUiRender)};
`;

  const outPath = new URL('../src/components/highlighted-code.ts', import.meta.url);
  await Bun.write(outPath, output);
  console.log(`Wrote ${outPath.pathname}`);

  highlighter.dispose();
}

main();
