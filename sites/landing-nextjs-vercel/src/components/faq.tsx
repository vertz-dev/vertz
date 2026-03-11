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
    <section className="py-24 px-6">
      <div className="max-w-2xl mx-auto">
        <p
          className="text-xs tracking-widest uppercase mb-12 text-center"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          What about...
        </p>

        <div className="flex flex-col">
          {QUESTIONS.map((item) => (
            <div
              key={item.q}
              className="py-6 border-b"
              style={{ borderColor: '#1e1e22' }}
            >
              <p className="font-semibold mb-2 text-gray-200">{item.q}</p>
              <p className="leading-relaxed text-gray-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
