import { css, token } from '@vertz/ui';
import { Footer } from '../components/footer';
import { Nav } from '../components/nav';

const s = css({
  page: { minHeight: '100vh' },
  article: {
    maxWidth: '48rem',
    marginInline: 'auto',
    paddingInline: token.spacing[6],
    paddingTop: token.spacing[32],
    paddingBottom: token.spacing[24],
  },
  subtitle: {
    fontSize: token.font.size.xl,
    marginBottom: token.spacing[16],
    color: token.color.gray[400],
  },
  section: { marginBottom: token.spacing[16] },
  sectionTitle: {
    fontSize: token.font.size['2xl'],
    marginBottom: token.spacing[6],
    color: token.color.gray[100],
  },
  paragraph: {
    fontSize: token.font.size.lg,
    lineHeight: token.font.lineHeight.relaxed,
    marginBottom: token.spacing[6],
    color: token.color.gray[400],
  },
  highlight: { color: token.color.gray[200], fontWeight: token.font.weight.medium },
  bold: { fontWeight: token.font.weight.semibold, color: token.color.gray[100] },
  divider: { marginBlock: token.spacing[16] },
  list: { marginBottom: token.spacing[6] },
  tradeoffItem: {
    fontSize: token.font.size.lg,
    lineHeight: token.font.lineHeight.relaxed,
    marginBottom: token.spacing[4],
    color: token.color.gray[400],
  },
  listItem: {
    fontSize: token.font.size.lg,
    lineHeight: token.font.lineHeight.relaxed,
    marginBottom: token.spacing[3],
    color: token.color.gray[400],
  },
  blockquote: {
    fontSize: token.font.size['2xl'],
    textAlign: 'center',
    marginBlock: token.spacing[8],
    color: token.color.gray[100],
  },
  closing: { fontSize: token.font.size.lg, textAlign: 'center', color: token.color.gray[400] },
});

export default function ManifestoPage() {
  return (
    <div className={s.page}>
      <Nav />
      <article className={s.article}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            letterSpacing: '-0.025em',
            lineHeight: '1.1',
            marginBottom: '1.5rem',
          }}
        >
          The Vertz Manifesto
        </h1>
        <p className={s.subtitle} style={{ fontStyle: 'italic' }}>
          Designed by humans. Built by LLMs, for LLMs.
        </p>

        {/* ── Not Just for Humans Anymore ── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle} style={{ fontFamily: 'var(--font-display)' }}>
            Not Just for Humans Anymore
          </h2>
          <p className={s.paragraph}>
            We built Vertz because the way we write software has changed.
          </p>
          <p className={s.paragraph}>
            While building our own products, we saw firsthand how much time teams waste fighting
            their tools instead of building what matters. We decided to do something about it.
          </p>
          <p className={s.paragraph}>
            LLMs now write code alongside us. They're fast, capable, and getting better every day.
            But they have a problem: they can't run your code. They can't see that runtime error.
            They can't know that the DI container will fail to resolve a dependency until you tell
            them — and by then, you've wasted tokens, time, and patience.
          </p>
          <p className={s.paragraph}>
            We spent countless hours watching LLMs get NestJS conventions wrong. Decorators in the
            wrong order. OpenAPI specs that didn't match the actual types. DTOs that looked right
            but broke at runtime. And every mistake meant more tokens, more iterations, more
            "actually, that's not quite right."
          </p>
          <p className={s.paragraph}>
            So we asked:{' '}
            <span className={s.bold}>
              What if the framework caught these mistakes at build time?
            </span>
          </p>
          <p className={s.paragraph}>
            What if types flowed naturally, so the compiler — not runtime — told you something was
            wrong? What if conventions were so clear and predictable that an LLM could nail it on
            the first try?
          </p>
          <p className={s.paragraph}>
            <span className={s.highlight}>That's Vertz.</span>
          </p>
        </section>

        <div
          className={s.divider}
          style={{
            height: '1px',
            background: 'linear-gradient(to right, transparent, #1e1e22, transparent)',
          }}
        />

        {/* ── What We Believe ── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle} style={{ fontFamily: 'var(--font-display)' }}>
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
          <p className={s.paragraph}>
            Decorators look elegant. We liked reading them too. But they're a dead end for type
            safety — types can't flow through decorator chains, and TypeScript can't help you when
            metadata is resolved at runtime.
          </p>
          <p className={s.paragraph}>
            We chose compile-time guarantees over runtime magic.{' '}
            <span className={s.highlight}>If your code builds, it runs.</span>
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
          <p className={s.paragraph}>
            Ambiguity is the enemy of LLMs — and of teams. When there are three ways to do
            something, you'll find all three in your codebase, and your LLM will guess wrong.
          </p>
          <p className={s.paragraph}>
            Vertz has opinions. Strong ones. Not because we think we're always right, but because{' '}
            <span className={s.highlight}>predictability matters more than flexibility.</span>
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
          <p className={s.paragraph}>
            OpenAPI generation isn't a plugin — it's built in. Environment validation isn't an
            afterthought — it's required. Type-safe dependency injection isn't optional — it's the
            only way.
          </p>
          <p className={s.paragraph}>
            We designed Vertz knowing that "production-ready" features would be needed from day one,
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
          <p className={s.paragraph}>
            We're building for a world where software is consumed by LLMs as much as by humans.
            Where types flow seamlessly from backend to frontend. Where your services aren't just
            endpoints — they're contracts that the entire stack can trust.
          </p>
          <p className={s.paragraph}>
            Vertz is designed so that every layer — from database to API to consumer —{' '}
            <span className={s.highlight}>speaks the same type-safe language.</span>
          </p>
        </section>

        <div
          className={s.divider}
          style={{
            height: '1px',
            background: 'linear-gradient(to right, transparent, #1e1e22, transparent)',
          }}
        />

        {/* ── The Tradeoffs We Accept ── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle} style={{ fontFamily: 'var(--font-display)' }}>
            The Tradeoffs We Accept
          </h2>
          <ul className={s.list} style={{ listStyle: 'none' }}>
            <li className={s.tradeoffItem}>
              <span className={s.bold}>Explicit over implicit.</span> More visible code, fewer
              surprises.
            </li>
            <li className={s.tradeoffItem}>
              <span className={s.bold}>Convention over configuration.</span> One clear path, not
              infinite options.
            </li>
            <li className={s.tradeoffItem}>
              <span className={s.bold}>Compile-time over runtime.</span> Errors surface when you
              build, not when you deploy.
            </li>
            <li className={s.tradeoffItem}>
              <span className={s.bold}>Predictability over convenience.</span> If a shortcut creates
              ambiguity, we skip it.
            </li>
          </ul>
        </section>

        <div
          className={s.divider}
          style={{
            height: '1px',
            background: 'linear-gradient(to right, transparent, #1e1e22, transparent)',
          }}
        />

        {/* ── Who Vertz Is For ── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle} style={{ fontFamily: 'var(--font-display)' }}>
            Who Vertz Is For
          </h2>
          <ul className={s.list} style={{ listStyle: 'none' }}>
            <li className={s.listItem}>
              Developers who want to move fast without sacrificing safety or clean, simple code
            </li>
            <li className={s.listItem}>
              Teams who need guardrails, consistency, and modular architecture as they scale
            </li>
            <li className={s.listItem}>
              Anyone building with LLMs who's tired of the iteration tax
            </li>
            <li className={s.listItem}>
              People who believe types should flow from backend to frontend
            </li>
            <li className={s.listItem}>
              Those who think "it works on my machine" isn't good enough
            </li>
          </ul>
        </section>

        <div
          className={s.divider}
          style={{
            height: '1px',
            background: 'linear-gradient(to right, transparent, #1e1e22, transparent)',
          }}
        />

        {/* ── The North Star ── */}
        <section className={s.section} style={{ textAlign: 'center' }}>
          <h2 className={s.sectionTitle} style={{ fontFamily: 'var(--font-display)' }}>
            The North Star
          </h2>
          <p className={s.paragraph} style={{ textAlign: 'center' }}>
            When a developer finishes their first Vertz project, we want them to say:
          </p>
          <p className={s.blockquote} style={{ fontFamily: 'var(--font-display)' }}>
            "My LLM nailed it on the first try."
          </p>
          <p className={s.paragraph} style={{ textAlign: 'center' }}>
            That's the bar. That's what we're building toward.
          </p>
        </section>

        <div
          className={s.divider}
          style={{
            height: '1px',
            background: 'linear-gradient(to right, transparent, #1e1e22, transparent)',
          }}
        />

        {/* ── Vertz Is NOT ── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle} style={{ fontFamily: 'var(--font-display)' }}>
            Vertz Is NOT
          </h2>
          <ul className={s.list} style={{ listStyle: 'none' }}>
            <li className={s.listItem}>A framework that hides complexity behind magic</li>
            <li className={s.listItem}>Another decorator-heavy clone with different syntax</li>
            <li className={s.listItem}>
              Complex to read for humans — it's clean enough for people, performant enough for
              agents
            </li>
            <li className={s.listItem}>Just for humans anymore</li>
          </ul>
        </section>

        <div
          className={s.divider}
          style={{
            height: '1px',
            background: 'linear-gradient(to right, transparent, #1e1e22, transparent)',
          }}
        />

        <p className={s.closing}>
          <span style={{ fontStyle: 'italic' }}>
            Vertz: Type-safe. LLM-native. Built for what's next.
          </span>
        </p>
      </article>
      <Footer />
    </div>
  );
}
