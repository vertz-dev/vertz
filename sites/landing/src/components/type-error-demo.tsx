import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  wrapper: ['max-w:4xl', 'mx:auto'],
  sectionLabel: ['font:xs', 'tracking:widest', 'uppercase', 'mb:4', 'text:center'],
  heading: ['font:4xl', 'mb:4', 'text:center'],
  subtitle: ['text:center', 'mb:12', 'max-w:xl', 'mx:auto'],
  grid: ['grid', 'grid-cols:2', 'gap:8'],
  columnLabel: ['font:xs', 'uppercase', 'tracking:wider', 'mb:3'],
  codeBlock: ['border:1', 'rounded:lg', 'p:6', 'font:sm'],
  codeLine: ['pl:6'],
  errorHint: ['font:xs', 'pl:4'],
  errorSpacer: ['mt:4', 'mb:1'],
  errorLabel: ['mb:1'],
});

const MONO = "font-family: 'JetBrains Mono', monospace";

export function TypeErrorDemo() {
  return (
    <section class={s.section}>
      <div class={s.wrapper}>
        <p class={s.sectionLabel} style={`${MONO}; color: #71717a`}>
          Type safety
        </p>
        <h2 class={s.heading} style="font-family: 'DM Serif Display', Georgia, serif">
          Rename a field. The compiler catches everything.
        </h2>
        <p class={s.subtitle} style="color: #a1a1aa">
          One rename. Every bug found at compile time. Zero runtime surprises.
        </p>

        <div class={s.grid}>
          <div>
            <p class={s.columnLabel} style={`${MONO}; color: #71717a`}>
              The change
            </p>
            <div
              class={s.codeBlock}
              style={`background: #0a0a0b; border-color: #1e1e22; ${MONO}; line-height: 1.75`}
            >
              <div style="color: #f8f8f2">
                <span style="color: #bd93f9">const </span>todos ={' '}
                <span style="color: #50fa7b">d</span>.table(
                <span style="color: #f1fa8c">'todos'</span>, {'{'}
              </div>
              <div class={s.codeLine} style="color: #f8f8f2">
                id:{'   '}
                <span style="color: #50fa7b">d</span>.uuid().primary(),
              </div>
              <div style="padding-left: 1.5rem; background: rgba(239,68,68,0.1); margin: 0 -1.5rem; padding-right: 1.5rem; border-left: 3px solid #ef4444">
                <span style="color: #ef4444; margin-right: 0.5rem">-</span>
                <span style="color: #f8f8f2; opacity: 0.5">
                  title: <span style="color: #50fa7b">d</span>.text(),
                </span>
              </div>
              <div style="padding-left: 1.5rem; background: rgba(34,197,94,0.1); margin: 0 -1.5rem; padding-right: 1.5rem; border-left: 3px solid #22c55e">
                <span style="color: #22c55e; margin-right: 0.5rem">+</span>
                <span style="color: #f8f8f2">
                  name:{'  '}
                  <span style="color: #50fa7b">d</span>.text(),
                </span>
              </div>
              <div class={s.codeLine} style="color: #f8f8f2">
                done:{'  '}
                <span style="color: #50fa7b">d</span>.boolean().default(
                <span style="color: #bd93f9">false</span>),
              </div>
              <div style="color: #f8f8f2">{'}'});</div>
            </div>
          </div>

          <div>
            <p class={s.columnLabel} style={`${MONO}; color: #ef4444`}>
              Compile errors
            </p>
            <div
              class={s.codeBlock}
              style={`background: #0a0a0b; border-color: rgba(239,68,68,0.3); ${MONO}; font-size: 0.8rem; line-height: 1.75`}
            >
              <div class={s.errorLabel} style="color: #71717a">
                <span style="color: #ef4444">✗</span> API call
              </div>
              <div style="color: #f8f8f2">
                api.todos.create({'{'}{' '}
                <span style="text-decoration: wavy underline; text-decoration-color: #ef4444; color: #f8f8f2">
                  title
                </span>
                : <span style="color: #f1fa8c">'Buy milk'</span> {'}'});
              </div>
              <div class={s.errorHint} style="color: #71717a">
                Property 'title' does not exist. Did you mean 'name'?
              </div>

              <div class={s.errorSpacer} style="color: #71717a">
                <span style="color: #ef4444">✗</span> UI render
              </div>
              <div style="color: #f8f8f2">
                {'<'}
                <span style="color: #ff79c6">li</span>
                {'>'}
                {'{'}t.
                <span style="text-decoration: wavy underline; text-decoration-color: #ef4444">
                  title
                </span>
                {'}'}
                {' </'}
                <span style="color: #ff79c6">li</span>
                {'>'}
              </div>
              <div class={s.errorHint} style="color: #71717a">
                Property 'title' does not exist on type 'Todo'.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
