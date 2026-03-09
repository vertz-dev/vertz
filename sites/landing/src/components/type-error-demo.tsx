import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
});

const MONO = "font-family: 'JetBrains Mono', monospace";

export function TypeErrorDemo() {
  return (
    <section class={s.section}>
      <div style="max-width: 56rem; margin: 0 auto">
        <p style={`${MONO}; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin-bottom: 1rem; text-align: center`}>
          Type safety
        </p>
        <h2 style="font-family: 'DM Serif Display', Georgia, serif; font-size: 2.25rem; margin-bottom: 1rem; text-align: center">
          Rename a field. The compiler catches everything.
        </h2>
        <p style="color: #a1a1aa; text-align: center; margin-bottom: 3rem; max-width: 36rem; margin-left: auto; margin-right: auto">
          One rename. Every bug found at compile time. Zero runtime surprises.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem">
          <div>
            <p style={`${MONO}; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; margin-bottom: 0.75rem`}>
              The change
            </p>
            <div style={`background: #0a0a0b; border: 1px solid #1e1e22; border-radius: 0.5rem; padding: 1.5rem; ${MONO}; font-size: 0.875rem; line-height: 1.75`}>
              <div style="color: #f8f8f2">
                <span style="color: #bd93f9">const </span>todos = <span style="color: #50fa7b">d</span>.table(<span style="color: #f1fa8c">'todos'</span>, {'{'}
              </div>
              <div style="color: #f8f8f2; padding-left: 1.5rem">
                id:{'   '}<span style="color: #50fa7b">d</span>.uuid().primary(),
              </div>
              <div style="padding-left: 1.5rem; background: rgba(239,68,68,0.1); margin: 0 -1.5rem; padding-right: 1.5rem; border-left: 3px solid #ef4444">
                <span style="color: #ef4444; margin-right: 0.5rem">-</span>
                <span style="color: #f8f8f2; opacity: 0.5">title: <span style="color: #50fa7b">d</span>.text(),</span>
              </div>
              <div style="padding-left: 1.5rem; background: rgba(34,197,94,0.1); margin: 0 -1.5rem; padding-right: 1.5rem; border-left: 3px solid #22c55e">
                <span style="color: #22c55e; margin-right: 0.5rem">+</span>
                <span style="color: #f8f8f2">name:{'  '}<span style="color: #50fa7b">d</span>.text(),</span>
              </div>
              <div style="color: #f8f8f2; padding-left: 1.5rem">
                done:{'  '}<span style="color: #50fa7b">d</span>.boolean().default(<span style="color: #bd93f9">false</span>),
              </div>
              <div style="color: #f8f8f2">{'}'});</div>
            </div>
          </div>

          <div>
            <p style={`${MONO}; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #ef4444; margin-bottom: 0.75rem`}>
              Compile errors
            </p>
            <div style={`background: #0a0a0b; border: 1px solid rgba(239,68,68,0.3); border-radius: 0.5rem; padding: 1.5rem; ${MONO}; font-size: 0.8rem; line-height: 1.75`}>
              <div style="color: #71717a; margin-bottom: 0.25rem">
                <span style="color: #ef4444">✗</span> API call
              </div>
              <div style="color: #f8f8f2">
                api.todos.create({'{'} <span style="text-decoration: wavy underline; text-decoration-color: #ef4444; color: #f8f8f2">title</span>: <span style="color: #f1fa8c">'Buy milk'</span> {'}'});
              </div>
              <div style="color: #71717a; font-size: 0.75rem; padding-left: 1rem">
                Property 'title' does not exist. Did you mean 'name'?
              </div>

              <div style="margin-top: 1rem; color: #71717a; margin-bottom: 0.25rem">
                <span style="color: #ef4444">✗</span> UI render
              </div>
              <div style="color: #f8f8f2">
                {'<'}<span style="color: #ff79c6">li</span>{'>'}{'{'}t.<span style="text-decoration: wavy underline; text-decoration-color: #ef4444">title</span>{'}'}{' </'}<span style="color: #ff79c6">li</span>{'>'}
              </div>
              <div style="color: #71717a; font-size: 0.75rem; padding-left: 1rem">
                Property 'title' does not exist on type 'Todo'.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
