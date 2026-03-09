import { css } from '@vertz/ui';
import {
  TOKENS_SCHEMA,
  TOKENS_ENTITY,
  TOKENS_UI,
} from './highlighted-code';
import { TokenLines } from './token-lines';

const s = css({
  section: ['py:24', 'px:6'],
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
      <div style="max-width: 56rem; margin: 0 auto">
        <p style={`${MONO}; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin-bottom: 1rem; text-align: center`}>
          How it works
        </p>
        <h2 style="font-family: 'DM Serif Display', Georgia, serif; font-size: 2.25rem; margin-bottom: 3rem; text-align: center">
          One schema. Three layers. Zero wiring.
        </h2>

        <div style="display: flex; flex-direction: column; gap: 2rem">
          {STEPS.map((step) => (
            <div key={step.label}>
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem">
                <span style={`${MONO}; font-size: 0.75rem; color: #3b82f6; font-weight: 600`}>
                  {step.label}
                </span>
                <span style={`${MONO}; font-size: 0.875rem; color: #e4e4e7`}>
                  {step.title}
                </span>
              </div>
              <div style="background: #0a0a0b; border: 1px solid #1e1e22; border-radius: 0.5rem; padding: 1.5rem; font-size: 0.875rem; line-height: 1.625; color: #d4d4d8; box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)">
                <TokenLines lines={step.tokens} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
