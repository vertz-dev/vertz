import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:2xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:12', 'text:center'],
  list: ['flex', 'flex-col'],
  item: ['py:6', 'border-b:1'],
  question: ['weight:semibold', 'mb:2'],
  answer: ['leading:relaxed'],
});

const MONO = "font-family: 'JetBrains Mono', monospace";

const QUESTIONS = [
  {
    q: 'Is it production-ready?',
    a: 'Pre-v1 and moving fast. Cloudflare Workers deployment works today. We break APIs intentionally to find the best design — and we ship every improvement as a patch.',
  },
  {
    q: 'Can I use existing libraries?',
    a: 'Yes. Standard TypeScript, runs on Bun, npm-compatible. Use any library you want alongside Vertz.',
  },
  {
    q: 'What if I only want the UI?',
    a: 'Use @vertz/ui standalone. The full stack is optional — each layer works independently.',
  },
  {
    q: 'What about React / Next.js?',
    a: "Vertz isn't a React wrapper. It's a different model: signals instead of VDOM, compile-time instead of runtime. If you're happy with React, stay. If you're tired of the ceremony, try Vertz.",
  },
];

export function FAQ() {
  return (
    <section class={s.section}>
      <div class={s.container}>
        <p class={s.label} style={MONO}>
          What about...
        </p>

        <div class={s.list}>
          {QUESTIONS.map((item) => (
            <div key={item.q} class={s.item} style="border-color: #1e1e22">
              <p class={s.question} style="color: #e4e4e7">
                {item.q}
              </p>
              <p class={s.answer} style="color: #a1a1aa">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
