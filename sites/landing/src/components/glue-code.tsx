import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  wrapper: ['max-w:4xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:12', 'text:center'],
  grid: ['grid', 'grid-cols:2', 'gap:8', 'items:start'],
  columnLabel: ['font:xs', 'uppercase', 'tracking:wide', 'mb:4'],
  codeBlock: ['border:1', 'rounded:lg', 'p:6', 'font:sm', 'leading:relaxed'],
  codeLine: [],
  codeLineIndented: ['pl:6'],
  spacer: ['mt:5'],
  caption: ['font:sm', 'mt:4', 'text:center'],
});

const MONO = "font-family: 'JetBrains Mono', monospace";

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
        <p class={s.label} style={`${MONO}; color: #71717a`}>
          The problem
        </p>

        <div class={s.grid}>
          <div>
            <p class={s.columnLabel} style={`${MONO}; color: #71717a`}>
              The typical stack
            </p>
            <div class={s.codeBlock} style="background: #0a0a0b; border-color: #1e1e22">
              {OLD_STACK.map((item) => (
                <div key={item.file} class={s.codeLine} style={`${MONO}; color: #52525b`}>
                  <span style="color: #71717a">{'// '}</span>
                  <span style="color: #a1a1aa">{item.file}</span>
                  <span style="color: #52525b"> — {item.desc}</span>
                </div>
              ))}
            </div>
            <p class={s.caption} style={`${MONO}; color: #52525b`}>
              5 files. Same shape. Pray they stay in sync.
            </p>
          </div>

          <div>
            <p class={s.columnLabel} style={`${MONO}; color: #3b82f6`}>
              With Vertz
            </p>
            <div
              class={s.codeBlock}
              style="background: #0a0a0b; border-color: rgba(59,130,246,0.3)"
            >
              <div class={s.codeLine} style={`${MONO}; color: #52525b; margin-bottom: 0.5rem`}>
                <span style="color: #71717a">{'// '}</span>
                <span style="color: #e4e4e7">schema.ts</span>
                <span style="color: #52525b"> — define it once</span>
              </div>
              <div class={s.codeLine} style={`${MONO}; color: #bd93f9`}>
                {'const '}
                <span style="color: #f8f8f2">todos</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">d</span>
                <span style="color: #f8f8f2">.table(</span>
                <span style="color: #f1fa8c">'todos'</span>
                <span style="color: #f8f8f2">, {'{'}</span>
              </div>
              <div class={s.codeLineIndented} style={`${MONO}; color: #f8f8f2`}>
                id:{'    '}
                <span style="color: #50fa7b">d</span>.uuid().primary(),
              </div>
              <div class={s.codeLineIndented} style={`${MONO}; color: #f8f8f2`}>
                title: <span style="color: #50fa7b">d</span>.text(),
              </div>
              <div class={s.codeLineIndented} style={`${MONO}; color: #f8f8f2`}>
                done:{'  '}
                <span style="color: #50fa7b">d</span>.boolean().default(
                <span style="color: #bd93f9">false</span>),
              </div>
              <div class={s.codeLine} style={`${MONO}; color: #f8f8f2`}>
                {'}'});
              </div>

              <div class={s.spacer} />

              <div class={s.codeLine} style={`${MONO}; color: #52525b; margin-bottom: 0.5rem`}>
                <span style="color: #71717a">{'// '}</span>
                <span style="color: #e4e4e7">TodoList.tsx</span>
                <span style="color: #52525b"> — use it everywhere</span>
              </div>
              <div class={s.codeLine} style={`${MONO}; color: #bd93f9`}>
                {'const '}
                <span style="color: #f8f8f2">todos</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">query</span>
                <span style="color: #f8f8f2">(api.todos.list());</span>
              </div>
              <div class={s.codeLine} style={`${MONO}; color: #bd93f9`}>
                {'const '}
                <span style="color: #f8f8f2">todoForm</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">form</span>
                <span style="color: #f8f8f2">(api.todos.create);</span>
              </div>
            </div>
            <p class={s.caption} style={`${MONO}; color: #3b82f6`}>
              1 schema. Everything else is derived.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
