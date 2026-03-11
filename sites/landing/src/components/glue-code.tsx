import { css } from '@vertz/ui';
import { TOKENS_GLUE_SCHEMA, TOKENS_GLUE_UI } from './highlighted-code';
import { TokenLines } from './token-lines';

const s = css({
  section: ['py:24', 'px:6'],
  wrapper: ['max-w:4xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:12', 'text:center', 'text:gray.500'],
  grid: ['grid', 'grid-cols:2', 'gap:8', 'items:start'],
  columnLabel: ['font:xs', 'uppercase', 'tracking:wide', 'mb:4'],
  codeBlock: ['border:1', 'rounded:lg', 'p:6', 'font:sm', 'leading:relaxed', 'bg:gray.950'],
  commentColor: ['text:gray.500'],
  fileColor: ['text:gray.400'],
  descColor: ['text:gray.400'],
  caption: ['font:sm', 'mt:4', 'text:center'],
});

const OLD_STACK = [
  { file: 'schema.prisma', desc: 'define the shape' },
  { file: 'server/todos.ts', desc: 'define it again for the API' },
  { file: 'lib/validators.ts', desc: 'define it again for validation' },
  { file: 'hooks/useTodos.ts', desc: 'define it again for fetching' },
  { file: 'components/TodoForm.tsx', desc: 'define it again for the form' },
];

export function GlueCode() {
  return (
    <section class={s.section}>
      <div class={s.wrapper}>
        <p class={s.label} style="font-family: var(--font-mono)">
          The problem
        </p>

        <div class={s.grid}>
          <div>
            <p class={s.columnLabel} style="font-family: var(--font-mono); color: #a1a1aa">
              The typical stack
            </p>
            <div class={s.codeBlock} style="border-color: #1e1e22">
              {OLD_STACK.map((item) => (
                <div key={item.file} style="font-family: var(--font-mono); color: #8b8b94">
                  <span class={s.commentColor}>{'// '}</span>
                  <span class={s.fileColor}>{item.file}</span>
                  <span class={s.descColor}> — {item.desc}</span>
                </div>
              ))}
            </div>
            <p class={s.caption} style="font-family: var(--font-mono); color: #8b8b94">
              5 files. Same shape. Pray they stay in sync.
            </p>
          </div>

          <div>
            <p class={s.columnLabel} style="font-family: var(--font-mono); color: #3b82f6">
              With Vertz
            </p>
            <div class={s.codeBlock} style="border-color: rgba(59,130,246,0.3)">
              <TokenLines lines={TOKENS_GLUE_SCHEMA} />
              <div style="margin-top: 1.25rem" />
              <TokenLines lines={TOKENS_GLUE_UI} />
            </div>
            <p class={s.caption} style="font-family: var(--font-mono); color: #3b82f6">
              1 schema. Everything else is derived.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
