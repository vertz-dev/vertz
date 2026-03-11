import { css } from '@vertz/ui';
import { Footer } from '../components/footer';
import { Nav } from '../components/nav';

const s = css({
  page: ['min-h:screen'],
  article: ['max-w:3xl', 'mx:auto', 'px:6', 'pt:32', 'pb:24'],
  subtitle: ['font:xl', 'mb:16', 'text:gray.400'],
  section: ['mb:16'],
  sectionTitle: ['font:2xl', 'mb:6', 'text:gray.100'],
  paragraph: ['font:lg', 'leading:relaxed', 'mb:6', 'text:gray.400'],
  highlight: ['text:gray.200', 'weight:medium'],
  bold: ['weight:semibold', 'text:gray.100'],
  divider: ['my:16'],
  list: ['mb:6'],
  tradeoffItem: ['font:lg', 'leading:relaxed', 'mb:4', 'text:gray.400'],
  listItem: ['font:lg', 'leading:relaxed', 'mb:3', 'text:gray.400'],
  blockquote: ['font:2xl', 'text:center', 'my:8', 'text:gray.100'],
  closing: ['font:lg', 'text:center', 'text:gray.400'],
});

export default function ManifestoPage() {
  return (
    <div class={s.page}>
      <Nav />
      <article class={s.article}>
        <h1 style="font-family: var(--font-display); font-size: clamp(2.5rem, 6vw, 4rem); letter-spacing: -0.025em; line-height: 1.1; margin-bottom: 1.5rem">
          The Vertz Manifesto
        </h1>
        <p class={s.subtitle} style="font-style: italic">
          Designed by humans. Built by LLMs, for LLMs.
        </p>

        {/* ── Not Just for Humans Anymore ── */}
        <section class={s.section}>
          <h2 class={s.sectionTitle} style="font-family: var(--font-display)">
            Not Just for Humans Anymore
          </h2>
          <p class={s.paragraph}>We built Vertz because the way we write software has changed.</p>
          <p class={s.paragraph}>
            While building our own products, we saw firsthand how much time teams waste fighting
            their tools instead of building what matters. We decided to do something about it.
          </p>
          <p class={s.paragraph}>
            LLMs now write code alongside us. They're fast, capable, and getting better every day.
            But they have a problem: they can't run your code. They can't see that runtime error.
            They can't know that the DI container will fail to resolve a dependency until you tell
            them — and by then, you've wasted tokens, time, and patience.
          </p>
          <p class={s.paragraph}>
            We spent countless hours watching LLMs get NestJS conventions wrong. Decorators in the
            wrong order. OpenAPI specs that didn't match the actual types. DTOs that looked right
            but broke at runtime. And every mistake meant more tokens, more iterations, more
            "actually, that's not quite right."
          </p>
          <p class={s.paragraph}>
            So we asked:{' '}
            <span class={s.bold}>What if the framework caught these mistakes at build time?</span>
          </p>
          <p class={s.paragraph}>
            What if types flowed naturally, so the compiler — not runtime — told you something was
            wrong? What if conventions were so clear and predictable that an LLM could nail it on
            the first try?
          </p>
          <p class={s.paragraph}>
            <span class={s.highlight}>That's Vertz.</span>
          </p>
        </section>

        <div
          class={s.divider}
          style="height: 1px; background: linear-gradient(to right, transparent, #1e1e22, transparent)"
        />

        {/* ── What We Believe ── */}
        <section class={s.section}>
          <h2 class={s.sectionTitle} style="font-family: var(--font-display)">
            What We Believe
          </h2>

          <h3 style="font-family: var(--font-display); font-size: 1.25rem; margin-bottom: 0.75rem; color: #e4e4e7">
            Type Safety Wins
          </h3>
          <p class={s.paragraph}>
            Decorators look elegant. We liked reading them too. But they're a dead end for type
            safety — types can't flow through decorator chains, and TypeScript can't help you when
            metadata is resolved at runtime.
          </p>
          <p class={s.paragraph}>
            We chose compile-time guarantees over runtime magic.{' '}
            <span class={s.highlight}>If your code builds, it runs.</span>
          </p>

          <h3 style="font-family: var(--font-display); font-size: 1.25rem; margin-bottom: 0.75rem; margin-top: 2rem; color: #e4e4e7">
            One Way to Do Things
          </h3>
          <p class={s.paragraph}>
            Ambiguity is the enemy of LLMs — and of teams. When there are three ways to do
            something, you'll find all three in your codebase, and your LLM will guess wrong.
          </p>
          <p class={s.paragraph}>
            Vertz has opinions. Strong ones. Not because we think we're always right, but because{' '}
            <span class={s.highlight}>predictability matters more than flexibility.</span>
          </p>

          <h3 style="font-family: var(--font-display); font-size: 1.25rem; margin-bottom: 0.75rem; margin-top: 2rem; color: #e4e4e7">
            Production-Ready by Default
          </h3>
          <p class={s.paragraph}>
            OpenAPI generation isn't a plugin — it's built in. Environment validation isn't an
            afterthought — it's required. Type-safe dependency injection isn't optional — it's the
            only way.
          </p>
          <p class={s.paragraph}>
            We designed Vertz knowing that "production-ready" features would be needed from day one,
            not bolted on later.
          </p>

          <h3 style="font-family: var(--font-display); font-size: 1.25rem; margin-bottom: 0.75rem; margin-top: 2rem; color: #e4e4e7">
            The Backend Is Just the First Step
          </h3>
          <p class={s.paragraph}>
            We're building for a world where software is consumed by LLMs as much as by humans.
            Where types flow seamlessly from backend to frontend. Where your services aren't just
            endpoints — they're contracts that the entire stack can trust.
          </p>
          <p class={s.paragraph}>
            Vertz is designed so that every layer — from database to API to consumer —{' '}
            <span class={s.highlight}>speaks the same type-safe language.</span>
          </p>
        </section>

        <div
          class={s.divider}
          style="height: 1px; background: linear-gradient(to right, transparent, #1e1e22, transparent)"
        />

        {/* ── The Tradeoffs We Accept ── */}
        <section class={s.section}>
          <h2 class={s.sectionTitle} style="font-family: var(--font-display)">
            The Tradeoffs We Accept
          </h2>
          <ul class={s.list} style="list-style: none">
            <li class={s.tradeoffItem}>
              <span class={s.bold}>Explicit over implicit.</span> More visible code, fewer
              surprises.
            </li>
            <li class={s.tradeoffItem}>
              <span class={s.bold}>Convention over configuration.</span> One clear path, not
              infinite options.
            </li>
            <li class={s.tradeoffItem}>
              <span class={s.bold}>Compile-time over runtime.</span> Errors surface when you build,
              not when you deploy.
            </li>
            <li class={s.tradeoffItem}>
              <span class={s.bold}>Predictability over convenience.</span> If a shortcut creates
              ambiguity, we skip it.
            </li>
          </ul>
        </section>

        <div
          class={s.divider}
          style="height: 1px; background: linear-gradient(to right, transparent, #1e1e22, transparent)"
        />

        {/* ── Who Vertz Is For ── */}
        <section class={s.section}>
          <h2 class={s.sectionTitle} style="font-family: var(--font-display)">
            Who Vertz Is For
          </h2>
          <ul class={s.list} style="list-style: none">
            <li class={s.listItem}>
              Developers who want to move fast without sacrificing safety or clean, simple code
            </li>
            <li class={s.listItem}>
              Teams who need guardrails, consistency, and modular architecture as they scale
            </li>
            <li class={s.listItem}>
              Anyone building with LLMs who's tired of the iteration tax
            </li>
            <li class={s.listItem}>
              People who believe types should flow from backend to frontend
            </li>
            <li class={s.listItem}>
              Those who think "it works on my machine" isn't good enough
            </li>
          </ul>
        </section>

        <div
          class={s.divider}
          style="height: 1px; background: linear-gradient(to right, transparent, #1e1e22, transparent)"
        />

        {/* ── The North Star ── */}
        <section class={s.section} style="text-align: center">
          <h2 class={s.sectionTitle} style="font-family: var(--font-display)">
            The North Star
          </h2>
          <p class={s.paragraph} style="text-align: center">
            When a developer finishes their first Vertz project, we want them to say:
          </p>
          <p class={s.blockquote} style="font-family: var(--font-display)">
            "My LLM nailed it on the first try."
          </p>
          <p class={s.paragraph} style="text-align: center">
            That's the bar. That's what we're building toward.
          </p>
        </section>

        <div
          class={s.divider}
          style="height: 1px; background: linear-gradient(to right, transparent, #1e1e22, transparent)"
        />

        {/* ── Vertz Is NOT ── */}
        <section class={s.section}>
          <h2 class={s.sectionTitle} style="font-family: var(--font-display)">
            Vertz Is NOT
          </h2>
          <ul class={s.list} style="list-style: none">
            <li class={s.listItem}>A framework that hides complexity behind magic</li>
            <li class={s.listItem}>Another decorator-heavy clone with different syntax</li>
            <li class={s.listItem}>
              Complex to read for humans — it's clean enough for people, performant enough for
              agents
            </li>
            <li class={s.listItem}>Just for humans anymore</li>
          </ul>
        </section>

        <div
          class={s.divider}
          style="height: 1px; background: linear-gradient(to right, transparent, #1e1e22, transparent)"
        />

        <p class={s.closing}>
          <span style="font-style: italic">Vertz: Type-safe. LLM-native. Built for what's next.</span>
        </p>
      </article>
      <Footer />
    </div>
  );
}
