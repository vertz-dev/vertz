import { css, token } from '@vertz/ui';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: { maxWidth: '42rem', marginInline: 'auto' },
  label: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[12],
    textAlign: 'center',
  },
  list: { display: 'flex', flexDirection: 'column' },
  item: { paddingBlock: token.spacing[6], borderBottomWidth: '1px' },
  question: {
    fontWeight: token.font.weight.semibold,
    marginBottom: token.spacing[2],
    color: token.color.gray[200],
  },
  answer: { lineHeight: token.font.lineHeight.relaxed, color: token.color.gray[400] },
});

const QUESTIONS = [
  {
    q: 'Is it production-ready?',
    a: 'Pre-v1 and moving fast. Cloudflare Workers deployment works today. We break APIs intentionally to find the best design — and we ship every improvement as a patch.',
  },
  {
    q: 'Can I use existing libraries?',
    a: 'Yes. Standard TypeScript, npm-compatible. Use any library you want alongside Vertz.',
  },
  {
    q: 'What if I only want the UI?',
    a: 'Use vertz/ui standalone. The full stack is optional — each layer works independently.',
  },
  {
    q: 'What about React / Next.js?',
    a: "Vertz isn't a React wrapper. It's a different model: signals instead of VDOM, compile-time instead of runtime. If you're happy with React, stay. If you're tired of the ceremony, try Vertz.",
  },
];

export function FAQ() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)' }}>
          What about...
        </p>

        <div className={s.list}>
          {QUESTIONS.map((item) => (
            <div key={item.q} className={s.item} style={{ borderColor: '#1e1e22' }}>
              <p className={s.question}>{item.q}</p>
              <p className={s.answer}>{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
