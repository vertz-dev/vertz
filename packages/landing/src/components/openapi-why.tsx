import { css, token } from '@vertz/ui';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: { maxWidth: '64rem', marginInline: 'auto' },
  label: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[12],
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gap: token.spacing[6],
    '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(3, 1fr)' },
  },
  card: {
    padding: token.spacing[8],
    borderWidth: '1px',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  title: { fontSize: token.font.size['2xl'], marginBottom: token.spacing[4] },
  desc: { lineHeight: token.font.lineHeight.relaxed },
});

const CARDS = [
  {
    title: 'Zero-config generation',
    desc: 'No Java runtime. No YAML templates. No plugin system to learn. Point at a spec, get a typed SDK. One dependency, one command.',
  },
  {
    title: 'Incremental & non-destructive',
    desc: 'Only writes files that actually changed (SHA-256 comparison). Cleans up stale files automatically. Safe to run on every CI build.',
  },
  {
    title: 'Agent-ready',
    desc: 'Feed the generated SDK to an LLM agent. It gets autocomplete, type errors, and validated inputs. No hallucinated endpoints. No wrong parameter names.',
  },
];

export function OpenAPIWhy() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}>
          Why generate?
        </p>
        <div className={s.grid}>
          {CARDS.map((card) => (
            <div
              key={card.title}
              className={s.card}
              style={{ background: '#1C1B1A', borderColor: '#2A2826', borderRadius: '2px' }}
            >
              <h3
                className={s.title}
                style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}
              >
                {card.title}
              </h3>
              <p className={s.desc} style={{ color: '#9C9690' }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
