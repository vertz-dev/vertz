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
