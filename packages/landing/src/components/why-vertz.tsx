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

const FEATURES = [
  {
    title: 'One schema, every layer',
    desc: 'Define your data once. The compiler derives your database, API, client SDK, and form validation. Change a field — it updates everywhere.',
  },
  {
    title: 'One way to do things',
    desc: 'No choice paralysis. No tribal knowledge. Every API has one canonical pattern. Your team and your AI agent write the same code — correctly, on the first try.',
  },
  {
    title: 'Production-ready by default',
    desc: 'Auth, validation, error handling, OpenAPI docs, deployment — built in, not bolted on. You add business logic. Vertz handles the rest.',
  },
];

export function WhyVertz() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}>
          Why Vertz
        </p>
        <div className={s.grid}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={s.card}
              style={{ background: '#1C1B1A', borderColor: '#2A2826', borderRadius: '2px' }}
            >
              <h3
                className={s.title}
                style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}
              >
                {f.title}
              </h3>
              <p className={s.desc} style={{ color: '#9C9690' }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
