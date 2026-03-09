import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:5xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:12', 'text:center'],
  grid: ['grid', 'grid-cols:3', 'gap:6'],
  card: ['p:8', 'border:1', 'rounded:lg', 'transition:colors'],
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
    <section class={s.section}>
      <div class={s.container}>
        <p class={s.label} style="font-family: 'JetBrains Mono', monospace; color: #71717a">
          Why Vertz
        </p>
        <div class={s.grid}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              class={s.card}
              style="background: rgba(17,17,19,0.5); border-color: rgba(30,30,34,0.5)"
            >
              <h3
                class={s.title}
                style="font-family: 'DM Serif Display', Georgia, serif; color: #e4e4e7"
              >
                {f.title}
              </h3>
              <p class={s.desc} style="color: #a1a1aa">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
