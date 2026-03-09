import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  wrapper: ['max-w:4xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:12', 'text:center', 'text:gray.500'],
  grid: ['grid', 'grid-cols:2', 'gap:8', 'items:start'],
  columnLabelZinc: ['font:xs', 'uppercase', 'tracking:wide', 'mb:4', 'text:gray.500'],
  columnLabelBlue: ['font:xs', 'uppercase', 'tracking:wide', 'mb:4'],
  codeBlock: ['border:1', 'rounded:lg', 'p:6', 'font:sm', 'leading:relaxed', 'bg:gray.950'],
  codeLine: [],
  codeLineZinc600: ['text:gray.600'],
  codeLineIndented: ['pl:6'],
  spacer: ['mt:5'],
  captionZinc: ['font:sm', 'mt:4', 'text:center', 'text:gray.600'],
  captionBlue: ['font:sm', 'mt:4', 'text:center'],
  commentColor: ['text:gray.500'],
  fileColor: ['text:gray.400'],
  descColor: ['text:gray.600'],
  highlightColor: ['text:gray.200'],
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
            <p class={s.columnLabelZinc} style="font-family: var(--font-mono)">
              The typical stack
            </p>
            <div class={s.codeBlock} style="border-color: #1e1e22">
              {OLD_STACK.map((item) => (
                <div
                  key={item.file}
                  class={s.codeLineZinc600}
                  style="font-family: var(--font-mono)"
                >
                  <span class={s.commentColor}>{'// '}</span>
                  <span class={s.fileColor}>{item.file}</span>
                  <span class={s.descColor}> — {item.desc}</span>
                </div>
              ))}
            </div>
            <p class={s.captionZinc} style="font-family: var(--font-mono)">
              5 files. Same shape. Pray they stay in sync.
            </p>
          </div>

          <div>
            <p class={s.columnLabelBlue} style="font-family: var(--font-mono); color: #3b82f6">
              With Vertz
            </p>
            <div class={s.codeBlock} style="border-color: rgba(59,130,246,0.3)">
              <div
                class={s.codeLineZinc600}
                style="font-family: var(--font-mono); margin-bottom: 0.5rem"
              >
                <span class={s.commentColor}>{'// '}</span>
                <span class={s.highlightColor}>schema.ts</span>
                <span class={s.descColor}> — define it once</span>
              </div>
              <div class={s.codeLine} style="font-family: var(--font-mono); color: #bd93f9">
                {'const '}
                <span style="color: #f8f8f2">todos</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">d</span>
                <span style="color: #f8f8f2">.table(</span>
                <span style="color: #f1fa8c">'todos'</span>
                <span style="color: #f8f8f2">, {'{'}</span>
              </div>
              <div class={s.codeLineIndented} style="font-family: var(--font-mono); color: #f8f8f2">
                id:{'    '}
                <span style="color: #50fa7b">d</span>.uuid().primary(),
              </div>
              <div class={s.codeLineIndented} style="font-family: var(--font-mono); color: #f8f8f2">
                title: <span style="color: #50fa7b">d</span>.text(),
              </div>
              <div class={s.codeLineIndented} style="font-family: var(--font-mono); color: #f8f8f2">
                done:{'  '}
                <span style="color: #50fa7b">d</span>.boolean().default(
                <span style="color: #bd93f9">false</span>),
              </div>
              <div class={s.codeLine} style="font-family: var(--font-mono); color: #f8f8f2">
                {'}'});
              </div>

              <div class={s.spacer} />

              <div
                class={s.codeLineZinc600}
                style="font-family: var(--font-mono); margin-bottom: 0.5rem"
              >
                <span class={s.commentColor}>{'// '}</span>
                <span class={s.highlightColor}>TodoList.tsx</span>
                <span class={s.descColor}> — use it everywhere</span>
              </div>
              <div class={s.codeLine} style="font-family: var(--font-mono); color: #bd93f9">
                {'const '}
                <span style="color: #f8f8f2">todos</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">query</span>
                <span style="color: #f8f8f2">(api.todos.list());</span>
              </div>
              <div class={s.codeLine} style="font-family: var(--font-mono); color: #bd93f9">
                {'const '}
                <span style="color: #f8f8f2">todoForm</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">form</span>
                <span style="color: #f8f8f2">(api.todos.create);</span>
              </div>
            </div>
            <p class={s.captionBlue} style="font-family: var(--font-mono); color: #3b82f6">
              1 schema. Everything else is derived.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
