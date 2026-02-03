# The Vertz Manifesto

*Designed by humans. Built by LLMs, for LLMs.*

## Not Just for Humans Anymore

We built Vertz because the way we write software has changed.

While building our own products, we saw firsthand how much time teams waste fighting their tools instead of building what matters. We decided to do something about it.

LLMs now write code alongside us. They're fast, capable, and getting better every day. But they have a problem: they can't run your code. They can't see that runtime error. They can't know that the DI container will fail to resolve a dependency until you tell them—and by then, you've wasted tokens, time, and patience.

We spent countless hours watching LLMs get NestJS conventions wrong. Decorators in the wrong order. OpenAPI specs that didn't match the actual types. DTOs that looked right but broke at runtime. And every mistake meant more tokens, more iterations, more "actually, that's not quite right."

So we asked: **What if the framework caught these mistakes at build time?**

What if types flowed naturally, so the compiler—not runtime—told you something was wrong? What if conventions were so clear and predictable that an LLM could nail it on the first try?

That's Vertz.

---

## What We Believe

### Type Safety Wins

Decorators look elegant. We liked reading them too. But they're a dead end for type safety—types can't flow through decorator chains, and TypeScript can't help you when metadata is resolved at runtime.

We chose compile-time guarantees over runtime magic. If your code builds, it runs.

### One Way to Do Things

Ambiguity is the enemy of LLMs—and of teams. When there are three ways to do something, you'll find all three in your codebase, and your LLM will guess wrong.

Vertz has opinions. Strong ones. Not because we think we're always right, but because predictability matters more than flexibility.

### Production-Ready by Default

OpenAPI generation isn't a plugin—it's built in. Environment validation isn't an afterthought—it's required. Type-safe dependency injection isn't optional—it's the only way.

We designed Vertz knowing that "production-ready" features would be needed from day one, not bolted on later.

### The Backend Is Just the First Step

We're building for a world where software is consumed by LLMs as much as by humans. Where types flow seamlessly from backend to frontend. Where your services aren't just endpoints—they're contracts that the entire stack can trust.

Vertz is designed so that every layer—from database to API to consumer—speaks the same type-safe language.

---

## The Tradeoffs We Accept

- **Explicit over implicit.** More visible code, fewer surprises.
- **Convention over configuration.** One clear path, not infinite options.
- **Compile-time over runtime.** Errors surface when you build, not when you deploy.
- **Predictability over convenience.** If a shortcut creates ambiguity, we skip it.

---

## Who Vertz Is For

- Developers who want to move fast without sacrificing safety or clean, simple code
- Teams who need guardrails, consistency, and modular architecture as they scale
- Anyone building with LLMs who's tired of the iteration tax
- People who believe types should flow from backend to frontend
- Those who think "it works on my machine" isn't good enough

---

## The North Star

When a developer finishes their first Vertz project, we want them to say:

**"My LLM nailed it on the first try."**

That's the bar. That's what we're building toward.

---

## Vertz Is NOT

- A framework that hides complexity behind magic
- Another decorator-heavy clone with different syntax
- Complex to read for humans — it's clean enough for people, performant enough for agents
- Just for humans anymore

---

*Vertz: Type-safe. LLM-native. Built for what's next.*
