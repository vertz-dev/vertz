import { css, token } from '@vertz/ui';
import { TOKENS_ENTITY, TOKENS_SCHEMA, TOKENS_UI } from './highlighted-code';
import { TokenLines } from './token-lines';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: { maxWidth: '56rem', marginInline: 'auto' },
  label: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[4],
    textAlign: 'center',
    color: token.color.gray[500],
  },
  heading: {
    fontSize: token.font.size['4xl'],
    marginBottom: token.spacing[12],
    textAlign: 'center',
  },
  stepList: { display: 'flex', flexDirection: 'column', gap: token.spacing[8] },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    marginBottom: token.spacing[3],
  },
  stepLabel: { fontSize: token.font.size.xs, fontWeight: token.font.weight.semibold },
  stepTitle: { fontSize: token.font.size.sm, color: token.color.gray[200] },
  codeBlock: {
    borderWidth: '1px',
    borderRadius: token.radius.lg,
    padding: token.spacing[6],
    fontSize: token.font.size.sm,
    lineHeight: token.font.lineHeight.relaxed,
    boxShadow: token.shadow['2xl'],
    backgroundColor: token.color.gray[950],
    color: token.color.gray[300],
    '&': { overflowX: 'auto' },
  },
});

const STEPS = [
  { label: '01', title: 'Define your data', tokens: TOKENS_SCHEMA },
  { label: '02', title: 'Get a typed API for free', tokens: TOKENS_ENTITY },
  { label: '03', title: 'Use it with full type safety', tokens: TOKENS_UI },
] as const;

export function SchemaFlow() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)' }}>
          One schema. Three layers. Zero wiring.
        </h2>

        <div className={s.stepList}>
          {STEPS.map((step) => (
            <div key={step.label}>
              <div className={s.stepHeader}>
                <span
                  className={s.stepLabel}
                  style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}
                >
                  {step.label}
                </span>
                <span className={s.stepTitle} style={{ fontFamily: 'var(--font-mono)' }}>
                  {step.title}
                </span>
              </div>
              <div className={s.codeBlock} style={{ borderColor: '#1e1e22' }}>
                <TokenLines lines={step.tokens} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
