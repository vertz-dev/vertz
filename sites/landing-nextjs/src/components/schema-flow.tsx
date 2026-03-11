import { TOKENS_ENTITY, TOKENS_SCHEMA, TOKENS_UI } from '@/lib/highlighted-code';
import { TokenLines } from './token-lines';

const STEPS = [
  { label: '01', title: 'Define your data', tokens: TOKENS_SCHEMA },
  { label: '02', title: 'Get a typed API for free', tokens: TOKENS_ENTITY },
  { label: '03', title: 'Use it with full type safety', tokens: TOKENS_UI },
] as const;

export function SchemaFlow() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <p
          className="text-xs tracking-widest uppercase mb-4 text-center text-gray-500"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          How it works
        </p>
        <h2
          className="text-4xl mb-12 text-center"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          One schema. Three layers. Zero wiring.
        </h2>

        <div className="flex flex-col gap-8">
          {STEPS.map((step) => (
            <div key={step.label}>
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="text-xs font-semibold"
                  style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}
                >
                  {step.label}
                </span>
                <span
                  className="text-sm text-gray-200"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {step.title}
                </span>
              </div>
              <div
                className="border rounded-lg p-6 text-sm leading-relaxed shadow-2xl bg-gray-950 text-gray-300"
                style={{ borderColor: '#1e1e22' }}
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
