import { css } from '@vertz/ui';
import { TOKENS_DIFF_SCHEMA, TOKENS_ERROR_API, TOKENS_ERROR_UI_RENDER } from './highlighted-code';

const s = css({
  section: ['py:24', 'px:6'],
  wrapper: ['max-w:4xl', 'mx:auto'],
  sectionLabel: ['font:xs', 'tracking:widest', 'uppercase', 'mb:4', 'text:center', 'text:gray.500'],
  heading: ['font:4xl', 'mb:4', 'text:center'],
  subtitle: ['text:center', 'mb:12', 'max-w:xl', 'mx:auto', 'text:gray.400'],
  grid: [
    'grid',
    'gap:8',
    { '@media (min-width: 768px)': [{ property: 'grid-template-columns', value: '1fr 1fr' }] },
  ],
  columnLabel: ['font:xs', 'uppercase', 'tracking:wider', 'mb:3'],
  codeBlock: [
    'border:1',
    'rounded:lg',
    'p:6',
    'font:sm',
    'bg:gray.950',
    { '&': [{ property: 'overflow-x', value: 'auto' }] },
  ],
  errorHint: ['font:xs', 'pl:4', 'text:gray.500'],
  errorSpacer: ['mt:4', 'mb:1', 'text:gray.500'],
  errorLabel: ['mb:1', 'text:gray.500'],
});

// Diff metadata: which lines in TOKENS_DIFF_SCHEMA get diff treatment
// Line indices: 0=opening, 1=id, 2=title(removed), 3=name(added), 4=done, 5=closing
const DIFF_LINES: Record<number, 'removed' | 'added'> = {
  2: 'removed',
  3: 'added',
};

const DIFF_STYLES = {
  removed:
    'position: relative; background: rgba(239,68,68,0.1); margin: 0 -1.5rem; padding: 0 1.5rem 0 calc(1.5rem - 3px); border-left: 3px solid #ef4444',
  added:
    'position: relative; background: rgba(34,197,94,0.1); margin: 0 -1.5rem; padding: 0 1.5rem 0 calc(1.5rem - 3px); border-left: 3px solid #22c55e',
} as const;

function DiffCodeBlock() {
  return (
    <div
      class={s.codeBlock}
      style="border-color: #1e1e22; font-family: var(--font-mono); line-height: 1.75"
    >
      <pre style="margin: 0">
        <code>
          {TOKENS_DIFF_SCHEMA.map((line, i) => {
            const diff = DIFF_LINES[i];
            if (diff) {
              return (
                <div key={i} style={DIFF_STYLES[diff]}>
                  <span
                    style={`position: absolute; left: 0.5rem; color: ${diff === 'removed' ? '#ef4444' : '#22c55e'}`}
                  >
                    {diff === 'removed' ? '-' : '+'}
                  </span>
                  <span style={diff === 'removed' ? 'opacity: 0.65' : undefined}>
                    {line.map((token) => (
                      <span key={token[1]} style={token[0]}>
                        {token[1]}
                      </span>
                    ))}
                  </span>
                </div>
              );
            }
            return (
              <span key={i}>
                {line.map((token) => (
                  <span key={token[1]} style={token[0]}>
                    {token[1]}
                  </span>
                ))}
                {'\n'}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

function ErrorCodeBlock() {
  return (
    <div
      class={s.codeBlock}
      style="border-color: rgba(239,68,68,0.3); font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.75"
    >
      <div class={s.errorLabel}>
        <span style="color: #ef4444">✗</span> API call
      </div>
      <div>
        <pre style="margin: 0; display: inline">
          <code>
            {TOKENS_ERROR_API[0].map((token) => {
              const isTitle = token[1] === ' title';
              return (
                <span
                  key={token[1]}
                  style={`${token[0]}${isTitle ? '; text-decoration: wavy underline; text-decoration-color: #ef4444' : ''}`}
                >
                  {token[1]}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      <div class={s.errorHint}>Property 'title' does not exist. Did you mean 'name'?</div>

      <div class={s.errorSpacer}>
        <span style="color: #ef4444">✗</span> UI render
      </div>
      <div>
        <pre style="margin: 0; display: inline">
          <code>
            {TOKENS_ERROR_UI_RENDER[0].map((token) => {
              const hasTitle = token[1].includes('title');
              if (!hasTitle) {
                return (
                  <span key={token[1]} style={token[0]}>
                    {token[1]}
                  </span>
                );
              }
              // Split token content around 'title' to apply wavy underline only to that word
              const parts = token[1].split('title');
              return (
                <span key={token[1]} style={token[0]}>
                  {parts[0]}
                  <span style="text-decoration: wavy underline; text-decoration-color: #ef4444">
                    title
                  </span>
                  {parts[1]}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      <div class={s.errorHint}>Property 'title' does not exist on type 'Todo'.</div>
    </div>
  );
}

export function TypeErrorDemo() {
  return (
    <section class={s.section}>
      <div class={s.wrapper}>
        <p class={s.sectionLabel} style="font-family: var(--font-mono)">
          Type safety
        </p>
        <h2 class={s.heading} style="font-family: var(--font-display)">
          Rename a field. The compiler catches everything.
        </h2>
        <p class={s.subtitle}>
          One rename. Every bug found at compile time. Zero runtime surprises.
        </p>

        <div class={s.grid}>
          <div>
            <p class={s.columnLabel} style="font-family: var(--font-mono); color: #a1a1aa">
              The change
            </p>
            <DiffCodeBlock />
          </div>

          <div>
            <p class={s.columnLabel} style="font-family: var(--font-mono); color: #ef4444">
              Compile errors
            </p>
            <ErrorCodeBlock />
          </div>
        </div>
      </div>
    </section>
  );
}
