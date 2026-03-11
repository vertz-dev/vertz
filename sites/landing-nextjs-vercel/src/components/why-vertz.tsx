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
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <p
          className="text-xs tracking-widest uppercase mb-12 text-center text-gray-500"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Why Vertz
        </p>
        <div className="grid grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-8 border rounded-lg transition-colors"
              style={{ background: 'rgba(17,17,19,0.5)', borderColor: 'rgba(30,30,34,0.5)' }}
            >
              <h3
                className="text-2xl mb-4 text-gray-200"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {f.title}
              </h3>
              <p className="leading-relaxed text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
