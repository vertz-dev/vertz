/**
 * Pre-generates syntax-highlighted token data using Shiki (Oniguruma engine).
 *
 * Run: bun packages/landing/scripts/generate-highlights.ts
 *
 * Output: packages/landing/src/components/highlighted-code.ts
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
import { rules } from '@vertz/auth/rules';
import { todosModel } from './schema';

export const todos = entity('todos', {
  model: todosModel,
  access: {
    list:   rules.authenticated(),
    create: rules.authenticated(),
    update: rules.all(
      rules.entitlement('todo:update'),
      rules.where({ userId: rules.user.id }),
    ),
    delete: rules.entitlement('todo:delete'),
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

// ---------- type hints removed ----------
// Hints added unnecessary complexity (dashed underlines + tooltips) that didn't
// land well visually. All snippets now use plain tokens only.

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

  const data = {
    counter: highlightCode(CODE_COUNTER),
    profile: highlightCode(CODE_PROFILE),
    form: highlightCode(CODE_FORM),
    css: highlightCode(CODE_CSS),
    schema: highlightCode(CODE_SCHEMA),
    entity: highlightCode(CODE_ENTITY),
    uiFlow: highlightCode(CODE_UI_FLOW),
    glueSchema: highlightCode(CODE_GLUE_SCHEMA),
    glueUi: highlightCode(CODE_GLUE_UI),
    diffSchema: highlightCode(CODE_DIFF_SCHEMA),
    errorApi: highlightCode(CODE_ERROR_API),
    errorUiRender: highlightCode(CODE_ERROR_UI_RENDER),
  };

  const output = `// AUTO-GENERATED by scripts/generate-highlights.ts — do not edit manually.
// Re-generate: bun packages/landing/scripts/generate-highlights.ts

/** Token format: [style, content] */

export type Token = [string, string];
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

  // Post-process: remap Dracula comment color for WCAG AA contrast on #0a0a0b background.
  // Original #6272A4 gives 4.20:1 ratio (needs 4.5:1). #7e8db8 gives ~4.8:1.
  const processed = output.replaceAll('#6272A4', '#7e8db8');

  const outPath = new URL('../src/components/highlighted-code.ts', import.meta.url);
  await Bun.write(outPath, processed);
  console.log(`Wrote ${outPath.pathname}`);

  highlighter.dispose();
}

main();
