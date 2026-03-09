import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
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
      <div style="max-width: 64rem; margin: 0 auto">
        <p style={`${MONO}; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin-bottom: 3rem; text-align: center`}>
          The problem
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: start">
          <div>
            <p style={`${MONO}; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; margin-bottom: 1rem`}>
              The typical stack
            </p>
            <div style="background: #0a0a0b; border: 1px solid #1e1e22; border-radius: 0.5rem; padding: 1.5rem; font-size: 0.875rem; line-height: 1.75">
              {OLD_STACK.map((item) => (
                <div key={item.file} style={`${MONO}; color: #52525b`}>
                  <span style="color: #71717a">// </span>
                  <span style="color: #a1a1aa">{item.file}</span>
                  <span style="color: #52525b">{' '}— {item.desc}</span>
                </div>
              ))}
            </div>
            <p style={`${MONO}; font-size: 0.8rem; color: #52525b; margin-top: 1rem; text-align: center`}>
              5 files. Same shape. Pray they stay in sync.
            </p>
          </div>

          <div>
            <p style={`${MONO}; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #3b82f6; margin-bottom: 1rem`}>
              With Vertz
            </p>
            <div style="background: #0a0a0b; border: 1px solid rgba(59,130,246,0.3); border-radius: 0.5rem; padding: 1.5rem; font-size: 0.875rem; line-height: 1.75">
              <div style={`${MONO}; color: #52525b; margin-bottom: 0.5rem`}>
                <span style="color: #71717a">// </span>
                <span style="color: #e4e4e7">schema.ts</span>
                <span style="color: #52525b">{' '}— define it once</span>
              </div>
              <div style={`${MONO}; color: #bd93f9`}>
                {'const '}
                <span style="color: #f8f8f2">todos</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">d</span>
                <span style="color: #f8f8f2">.table(</span>
                <span style="color: #f1fa8c">'todos'</span>
                <span style="color: #f8f8f2">, {'{'}</span>
              </div>
              <div style={`${MONO}; color: #f8f8f2; padding-left: 1.5rem`}>
                id:{'    '}
                <span style="color: #50fa7b">d</span>.uuid().primary(),
              </div>
              <div style={`${MONO}; color: #f8f8f2; padding-left: 1.5rem`}>
                title: <span style="color: #50fa7b">d</span>.text(),
              </div>
              <div style={`${MONO}; color: #f8f8f2; padding-left: 1.5rem`}>
                done:{'  '}
                <span style="color: #50fa7b">d</span>.boolean().default(
                <span style="color: #bd93f9">false</span>),
              </div>
              <div style={`${MONO}; color: #f8f8f2`}>{'}'});</div>

              <div style="margin-top: 1.25rem" />

              <div style={`${MONO}; color: #52525b; margin-bottom: 0.5rem`}>
                <span style="color: #71717a">// </span>
                <span style="color: #e4e4e7">TodoList.tsx</span>
                <span style="color: #52525b">{' '}— use it everywhere</span>
              </div>
              <div style={`${MONO}; color: #bd93f9`}>
                {'const '}
                <span style="color: #f8f8f2">todos</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">query</span>
                <span style="color: #f8f8f2">(api.todos.list());</span>
              </div>
              <div style={`${MONO}; color: #bd93f9`}>
                {'const '}
                <span style="color: #f8f8f2">todoForm</span>
                <span style="color: #ff79c6">{' = '}</span>
                <span style="color: #50fa7b">form</span>
                <span style="color: #f8f8f2">(api.todos.create);</span>
              </div>
            </div>
            <p style={`${MONO}; font-size: 0.8rem; color: #3b82f6; margin-top: 1rem; text-align: center`}>
              1 schema. Everything else is derived.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
