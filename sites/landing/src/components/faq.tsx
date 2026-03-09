import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
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
      <div style="max-width: 42rem; margin: 0 auto">
        <p style={`${MONO}; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin-bottom: 3rem; text-align: center`}>
          What about...
        </p>

        <div style="display: flex; flex-direction: column; gap: 0">
          {QUESTIONS.map((item) => (
            <div key={item.q} style="padding: 1.5rem 0; border-bottom: 1px solid #1e1e22">
              <p style="font-weight: 600; color: #e4e4e7; margin-bottom: 0.5rem">
                {item.q}
              </p>
              <p style="color: #a1a1aa; line-height: 1.625">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
