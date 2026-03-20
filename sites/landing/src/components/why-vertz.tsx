import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:5xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:12', 'text:center', 'text:gray.500'],
  grid: [
    'grid',
    'gap:6',
    { '@media (min-width: 768px)': { 'grid-template-columns': 'repeat(3, 1fr)' } },
  ],
  card: ['p:8', 'border:1', 'rounded:lg', 'transition:colors'],
  title: ['font:2xl', 'mb:4', 'text:gray.200'],
  desc: ['leading:relaxed', 'text:gray.400'],
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
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)' }}>
          Why Vertz
        </p>
        <div className={s.grid}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={s.card}
              style={{ background: 'rgba(17,17,19,0.5)', borderColor: 'rgba(30,30,34,0.5)' }}
            >
              <h3 className={s.title} style={{ fontFamily: 'var(--font-display)' }}>
                {f.title}
              </h3>
              <p className={s.desc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
