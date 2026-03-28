import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:5xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:12', 'text:center'],
  grid: [
    'grid',
    'gap:6',
    { '@media (min-width: 768px)': { 'grid-template-columns': 'repeat(3, 1fr)' } },
  ],
  card: ['p:8', 'border:1', 'transition:colors'],
  title: ['font:2xl', 'mb:4'],
  desc: ['leading:relaxed'],
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
              <h3 className={s.title} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
                {f.title}
              </h3>
              <p className={s.desc} style={{ color: '#9C9690' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
