# Messaging v2: Repositioning "Built for LLMs"

**Date:** 2026-02-16  
**Author:** josh (DX & Developer Relations)  
**Status:** Draft for Review  
**Related:** Usability Test Results (Issue #351)

---

## Executive Summary

This document proposes revised positioning messaging for Vertz based on usability testing feedback. The current "Built for LLMs" messaging creates confusion and concern among target developers, particularly junior developers who question the framework's production-readiness. We propose shifting from an AI-centric pitch to a developer-benefit-first approach.

---

## Why the Current Messaging Failed

### User Feedback Summary

| Persona | Score | Key Concern |
|---------|-------|-------------|
| Junior Developer (React + Node.js) | 6.5/10 | "Made me question if this is production-ready or just an experiment" |
| Senior Full-Stack (Next.js + Prisma) | 8/10 | Understands it but agrees it shouldn't be primary pitch |

### Specific Confusions Identified

1. **"Built by LLMs" → Questionable stability**
   - Junior dev: "If the pitch is 'the framework was built by Claude,' I'm like... okay? Does that make it better for me?"
   - Junior dev: "Who do I ask for help if something breaks?"

2. **"For LLMs" → Unclear value proposition**
   - Junior dev: "The README focuses heavily on 'LLMs write code' — but why should I care as a human?"
   - Junior dev: "I'm more confused than excited by this"

3. **Primary vs Secondary messaging**
   - Both personas agree: LLM messaging should be moved to a footnote, not headline
   - Recommendation from consolidated findings: "Lead with developer benefits"

### Root Cause

The "Built for LLMs" messaging leads with the **how** (how the framework was built) instead of the **what** (what the developer gets). Developers evaluate frameworks based on:
- Will this help me ship faster?
- Is this stable for production?
- Can I get help if stuck?

The current messaging answers none of these questions—it creates uncertainty instead of confidence.

---

## Proposed Messaging Alternatives

### Option A: Type Safety as the Lead

**Tagline:** "Types that flow from database to UI"

**Expanded:**
> Vertz is a type-safe full-stack TypeScript framework. Define your schema once, and types flow automatically to your database, API routes, and frontend components. Less boilerplate, more building.

**Why it works:**
- Addresses the #1 thing users loved in testing: "End-to-end type safety — Schema → API → DB → Frontend, all typed"
- Junior devs immediately understand value ("I deal with TypeScript `any` hell all the time")
- Senior devs appreciate the precision ("superior to disjointed Next.js/Prisma/Zod glue")

**Maps to user confusion:**
- ❌ "Built for LLMs" confusion → ✅ Clear developer benefit
- ❌ "Is it production-ready?" → ✅ Type safety implies stability
- ❌ "What problem does this solve for ME?" → ✅ Solves type synchronization pain

---

### Option B: DX/Boilerplate Reduction

**Tagline:** "Less ceremony, more code"

**Expanded:**
> Vertz is a TypeScript framework that eliminates the glue code. One schema drives your validation, database, and UI. `let count = 0` is already reactive—no hooks required. From idea to production with fewer files and less boilerplate.

**Why it works:**
- Junior devs loved: "Less boilerplate — `let count = 0` vs `const [count, setCount] = useState(0)`"
- Junior devs loved: "Don't have to pick and wire together separate routing/validation/ORM libraries"
- Concrete, tangible benefit that contrasts with React/Next.js patterns

**Maps to user confusion:**
- ❌ "Built by LLMs for LLMs" → ✅ Lead with human developer experience
- ❌ "Too much ceremony" → ✅ "Less ceremony, more code"
- ❌ "Is this like NestJS?" → ✅ Framework positions as simpler alternative

---

### Option C: Integrated Stack

**Tagline:** "From database to browser in one stack"

**Expanded:**
> Vertz is an integrated TypeScript stack—schema, database, API, and UI that work together. No more stitching together Prisma + tRPC + Zod + React. Define your data once, use it everywhere. Built with strong types and compile-time guarantees.

**Why it works:**
- Addresses the "full-stack confusion" (junior dev: "Is this backend-only or full-stack?")
- Senior devs appreciated: "It removes the ambiguity of 'many ways to do things'"
- Positions Vertz as a complete solution vs. a collection of packages

**Maps to user confusion:**
- ❌ "Is this backend-only or full-stack?" → ✅ Clear: full-stack integrated
- ❌ "How do pieces connect?" → ✅ "One stack" implies built to work together
- ❌ "vs Express? vs Next.js?" → ✅ Positions as integrated alternative

---

## Secondary Messaging: The LLM Story

While the primary messaging should shift, the LLM story is still valuable for:

1. **AI-assisted development** — Senior dev: "For an AI-generated project: YES. This is the killer use case. If I'm using an agent to build the app, Vertz protects me from the agent's mistakes."

2. **Technical differentiation** — The explicit architecture (modules, DI, strict patterns) helps AI agents produce correct code.

3. **Innovation narrative** — Shows forward-thinking approach to development.

**Recommended placement:** A dedicated section titled "AI-Developer Friendly" or "Built for AI-Assisted Development" with language like:

> Vertz's explicit patterns and compile-time validations make it ideal for AI-assisted development. When an AI writes your code, Vertz catches mistakes before runtime—so you get the benefits of AI speed with type safety guarantees.

---

## Recommendation

**Recommended:** Option A (Type Safety) as primary, with Option B or C as secondary variants.

**Rationale:**
1. Type safety was the #1 thing users loved in testing across all personas
2. It's the most differentiated vs. existing frameworks (Next.js, Express)
3. It addresses the production-readiness concern indirectly (strong types = stability)
4. It's easy to demonstrate with concrete code examples

**Implementation approach:**
- Landing page hero: Replace "Built for LLMs" with "Types that flow from database to UI"
- README introduction: Lead with type safety benefits, move LLM story to bottom
- Marketing materials: A/B test Option A vs Option B with target audience

---

## Next Steps

- [ ] Review this proposal with product team
- [ ] A/B test messaging variants with target developers
- [ ] Update landing page copy (separate ticket)
- [ ] Update README introduction (separate ticket)
- [ ] Create "AI-Developer Friendly" secondary content

---

## Appendix: Relevant Quotes from Usability Tests

> "The 'Built for LLMs' messaging makes me question if this is production-ready or just an experiment. Who do I ask for help if something breaks?" — Junior Developer

> "I'm more confused than excited by this. If the pitch is 'the framework was built by Claude,' I'm like... okay? Does that make it better for me?" — Junior Developer

> "For an AI-generated project: YES. This is the killer use case. If I'm using an agent to build the app, Vertz protects me from the agent's mistakes." — Senior Developer

> "End-to-end type safety — Schema → API → DB → Frontend, all typed" — Junior Developer (what they liked most)

> "It removes the ambiguity of 'many ways to do things' (e.g., Next.js App Router vs Pages, Server Actions vs API routes)." — Senior Developer
