export default function ManifestoPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 pt-32 pb-24">
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          letterSpacing: '-0.025em',
          lineHeight: 1.1,
          marginBottom: '1.5rem',
        }}
      >
        The Vertz Manifesto
      </h1>
      <p className="text-xl mb-16 text-gray-400" style={{ fontStyle: 'italic' }}>
        Designed by humans. Built by LLMs, for LLMs.
      </p>

      {/* Not Just for Humans Anymore */}
      <section className="mb-16">
        <h2
          className="text-2xl mb-6 text-gray-100"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Not Just for Humans Anymore
        </h2>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          We built Vertz because the way we write software has changed.
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          While building our own products, we saw firsthand how much time teams waste fighting
          their tools instead of building what matters. We decided to do something about it.
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          LLMs now write code alongside us. They&apos;re fast, capable, and getting better every day.
          But they have a problem: they can&apos;t run your code. They can&apos;t see that runtime error.
          They can&apos;t know that the DI container will fail to resolve a dependency until you tell
          them — and by then, you&apos;ve wasted tokens, time, and patience.
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          We spent countless hours watching LLMs get NestJS conventions wrong. Decorators in the
          wrong order. OpenAPI specs that didn&apos;t match the actual types. DTOs that looked right
          but broke at runtime. And every mistake meant more tokens, more iterations, more
          &quot;actually, that&apos;s not quite right.&quot;
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          So we asked:{' '}
          <span className="font-semibold text-gray-100">
            What if the framework caught these mistakes at build time?
          </span>
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          What if types flowed naturally, so the compiler — not runtime — told you something was
          wrong? What if conventions were so clear and predictable that an LLM could nail it on
          the first try?
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          <span className="text-gray-200 font-medium">That&apos;s Vertz.</span>
        </p>
      </section>

      <div
        className="my-16"
        style={{ height: '1px', background: 'linear-gradient(to right, transparent, #1e1e22, transparent)' }}
      />

      {/* What We Believe */}
      <section className="mb-16">
        <h2
          className="text-2xl mb-6 text-gray-100"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          What We Believe
        </h2>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            marginBottom: '0.75rem',
            color: '#e4e4e7',
          }}
        >
          Type Safety Wins
        </h3>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          Decorators look elegant. We liked reading them too. But they&apos;re a dead end for type
          safety — types can&apos;t flow through decorator chains, and TypeScript can&apos;t help you when
          metadata is resolved at runtime.
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          We chose compile-time guarantees over runtime magic.{' '}
          <span className="text-gray-200 font-medium">If your code builds, it runs.</span>
        </p>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            marginBottom: '0.75rem',
            marginTop: '2rem',
            color: '#e4e4e7',
          }}
        >
          One Way to Do Things
        </h3>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          Ambiguity is the enemy of LLMs — and of teams. When there are three ways to do
          something, you&apos;ll find all three in your codebase, and your LLM will guess wrong.
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          Vertz has opinions. Strong ones. Not because we think we&apos;re always right, but because{' '}
          <span className="text-gray-200 font-medium">
            predictability matters more than flexibility.
          </span>
        </p>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            marginBottom: '0.75rem',
            marginTop: '2rem',
            color: '#e4e4e7',
          }}
        >
          Production-Ready by Default
        </h3>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          OpenAPI generation isn&apos;t a plugin — it&apos;s built in. Environment validation isn&apos;t an
          afterthought — it&apos;s required. Type-safe dependency injection isn&apos;t optional — it&apos;s the
          only way.
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          We designed Vertz knowing that &quot;production-ready&quot; features would be needed from day one,
          not bolted on later.
        </p>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            marginBottom: '0.75rem',
            marginTop: '2rem',
            color: '#e4e4e7',
          }}
        >
          The Backend Is Just the First Step
        </h3>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          We&apos;re building for a world where software is consumed by LLMs as much as by humans.
          Where types flow seamlessly from backend to frontend. Where your services aren&apos;t just
          endpoints — they&apos;re contracts that the entire stack can trust.
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400">
          Vertz is designed so that every layer — from database to API to consumer —{' '}
          <span className="text-gray-200 font-medium">speaks the same type-safe language.</span>
        </p>
      </section>

      <div
        className="my-16"
        style={{ height: '1px', background: 'linear-gradient(to right, transparent, #1e1e22, transparent)' }}
      />

      {/* The Tradeoffs We Accept */}
      <section className="mb-16">
        <h2
          className="text-2xl mb-6 text-gray-100"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          The Tradeoffs We Accept
        </h2>
        <ul className="mb-6" style={{ listStyle: 'none' }}>
          <li className="text-lg leading-relaxed mb-4 text-gray-400">
            <span className="font-semibold text-gray-100">Explicit over implicit.</span> More visible code, fewer
            surprises.
          </li>
          <li className="text-lg leading-relaxed mb-4 text-gray-400">
            <span className="font-semibold text-gray-100">Convention over configuration.</span> One clear path, not
            infinite options.
          </li>
          <li className="text-lg leading-relaxed mb-4 text-gray-400">
            <span className="font-semibold text-gray-100">Compile-time over runtime.</span> Errors surface when you build,
            not when you deploy.
          </li>
          <li className="text-lg leading-relaxed mb-4 text-gray-400">
            <span className="font-semibold text-gray-100">Predictability over convenience.</span> If a shortcut creates
            ambiguity, we skip it.
          </li>
        </ul>
      </section>

      <div
        className="my-16"
        style={{ height: '1px', background: 'linear-gradient(to right, transparent, #1e1e22, transparent)' }}
      />

      {/* Who Vertz Is For */}
      <section className="mb-16">
        <h2
          className="text-2xl mb-6 text-gray-100"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Who Vertz Is For
        </h2>
        <ul className="mb-6" style={{ listStyle: 'none' }}>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            Developers who want to move fast without sacrificing safety or clean, simple code
          </li>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            Teams who need guardrails, consistency, and modular architecture as they scale
          </li>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            Anyone building with LLMs who&apos;s tired of the iteration tax
          </li>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            People who believe types should flow from backend to frontend
          </li>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            Those who think &quot;it works on my machine&quot; isn&apos;t good enough
          </li>
        </ul>
      </section>

      <div
        className="my-16"
        style={{ height: '1px', background: 'linear-gradient(to right, transparent, #1e1e22, transparent)' }}
      />

      {/* The North Star */}
      <section className="mb-16" style={{ textAlign: 'center' }}>
        <h2
          className="text-2xl mb-6 text-gray-100"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          The North Star
        </h2>
        <p className="text-lg leading-relaxed mb-6 text-gray-400" style={{ textAlign: 'center' }}>
          When a developer finishes their first Vertz project, we want them to say:
        </p>
        <p
          className="text-2xl text-center my-8 text-gray-100"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          &quot;My LLM nailed it on the first try.&quot;
        </p>
        <p className="text-lg leading-relaxed mb-6 text-gray-400" style={{ textAlign: 'center' }}>
          That&apos;s the bar. That&apos;s what we&apos;re building toward.
        </p>
      </section>

      <div
        className="my-16"
        style={{ height: '1px', background: 'linear-gradient(to right, transparent, #1e1e22, transparent)' }}
      />

      {/* Vertz Is NOT */}
      <section className="mb-16">
        <h2
          className="text-2xl mb-6 text-gray-100"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Vertz Is NOT
        </h2>
        <ul className="mb-6" style={{ listStyle: 'none' }}>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            A framework that hides complexity behind magic
          </li>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            Another decorator-heavy clone with different syntax
          </li>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            Complex to read for humans — it&apos;s clean enough for people, performant enough for
            agents
          </li>
          <li className="text-lg leading-relaxed mb-3 text-gray-400">
            Just for humans anymore
          </li>
        </ul>
      </section>

      <div
        className="my-16"
        style={{ height: '1px', background: 'linear-gradient(to right, transparent, #1e1e22, transparent)' }}
      />

      <p className="text-lg text-center text-gray-400">
        <span style={{ fontStyle: 'italic' }}>Vertz: Type-safe. LLM-native. Built for what&apos;s next.</span>
      </p>
    </article>
  );
}
