import { css } from '@vertz/ui';
import { TOKENS_ENTITY, TOKENS_SCHEMA, TOKENS_UI } from './highlighted-code';
import { TokenLines } from './token-lines';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:4xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:4', 'text:center'],
  heading: ['font:4xl', 'mb:12', 'text:center'],
  stepList: ['flex', 'flex-col', 'gap:8'],
  stepHeader: ['flex', 'items:center', 'gap:3', 'mb:3'],
  stepLabel: ['font:xs', 'weight:semibold'],
  stepTitle: ['font:sm'],
  codeBlock: ['border:1', 'rounded:lg', 'p:6', 'font:sm', 'leading:relaxed', 'shadow:2xl'],
});

const MONO = "font-family: 'JetBrains Mono', monospace";

const STEPS = [
  { label: '01', title: 'Define your data', tokens: TOKENS_SCHEMA },
  { label: '02', title: 'Get a typed API for free', tokens: TOKENS_ENTITY },
  { label: '03', title: 'Use it with full type safety', tokens: TOKENS_UI },
] as const;

export function SchemaFlow() {
  return (
    <section class={s.section}>
      <div class={s.container}>
        <p class={s.label} style={`${MONO}; color: #71717a`}>
          How it works
        </p>
        <h2 class={s.heading} style="font-family: 'DM Serif Display', Georgia, serif">
          One schema. Three layers. Zero wiring.
        </h2>

        <div class={s.stepList}>
          {STEPS.map((step) => (
            <div key={step.label}>
              <div class={s.stepHeader}>
                <span class={s.stepLabel} style={`${MONO}; color: #3b82f6`}>
                  {step.label}
                </span>
                <span class={s.stepTitle} style={`${MONO}; color: #e4e4e7`}>
                  {step.title}
                </span>
              </div>
              <div
                class={s.codeBlock}
                style="background: #0a0a0b; border-color: #1e1e22; color: #d4d4d8"
              >
                <TokenLines lines={step.tokens} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
