# The Vertz Vision

## Mission

Build the only development stack you need — from database to browser — where every layer is type-safe, every API is predictable, and every decision is optimized for both human developers and the AI agents that build alongside them.

## Where We're Going

Vertz is not a framework. It's not a piece of the stack. It's the stack.

Today, building a production application means stitching together a dozen tools that don't talk to each other. Your ORM doesn't know about your API schema. Your API schema doesn't know about your frontend types. Your frontend types don't know about your validation rules. Every seam is a place where bugs hide and LLMs guess wrong.

We're eliminating the seams.

Vertz will own the full path: **schema → database → API → client → UI**. One type system. One set of conventions. One source of truth that flows through every layer. When you define a schema, it becomes your database table, your API contract, your client types, and your form validation — automatically, correctly, and with zero manual wiring.

This is not a 5-year dream. This is the roadmap. We ship it piece by piece, and every piece we ship is the best-in-class tool for that layer.

## Principles

### 1. If it builds, it works

The compiler is the quality gate. Not your eyes, not manual testing, not hoping the runtime resolves correctly. If TypeScript says it's good, it runs. This is an architectural commitment — every API we design must be expressible in the type system so the compiler can verify it.

### 2. One way to do things

Ambiguity is a tax. It's a tax on teams who find three patterns in one codebase. It's a tax on LLMs who guess which pattern to use. It's a tax on onboarding, on code review, on debugging. We pay the cost of being opinionated once so that every user — human or AI — never pays the ambiguity tax again.

### 3. AI agents are first-class users

Every API decision is evaluated by one question: *"Can an LLM use this correctly on the first prompt?"* This isn't a nice-to-have. This is a design constraint as hard as type safety. If an API is confusing to an LLM, it's confusing to a junior developer, and it's probably confusing to a senior developer who's moving fast. Designing for AI makes us design better for everyone.

### 4. Test what matters, nothing more

TDD is mandatory. But TDD doesn't mean "test everything" — it means test every *behavior*. Write the failing test. Write the minimum code to make it pass. Stop. No speculative code, no premature abstractions, no "while I'm here" additions. The code that doesn't exist has no bugs.

### 5. If you can't test it, don't build it

Testability is not a quality you add after the fact — it's a design requirement. If a feature can't be verified with a test, the design is wrong. If a bug can't be reproduced with a failing test, you don't understand it well enough to fix it. This cuts both ways: it forces us to design systems that are testable in isolation, and it prevents us from shipping fixes for problems we can't prove we've solved. No test, no implementation. No reproduction, no fix.

### 6. If you can't demo it, it's not done

Every feature must be demonstrable. Not "it passes tests" — someone can *see it working*. If you can't show a developer using the feature end-to-end, you haven't finished. This forces us to think about the real experience, not just the internal implementation. It feeds our build-in-public culture, it keeps us honest about what we've actually shipped, and it catches the gap between "technically complete" and "actually useful." A feature without a demo is a feature nobody knows exists.

### 7. Performance is not optional

Fast for end-users. Fast for developers. Fast for AI agents. We measure cold starts, request throughput, type-check speed, and build times. If we're not the fastest, we find out why and we fix it. Performance is a feature, not a follow-up.

### 8. No ceilings

If a dependency limits us, we replace it. If the runtime is too slow, we build a faster one. If the compiler can't express what we need, we extend it. We don't accept someone else's limitations as our own. This is not about NIH syndrome — it's about refusing to ship "good enough" when "best possible" is within reach.

## What This Means In Practice

These principles aren't abstract. They drive real decisions:

- **We chose functions over decorators** — because types flow through functions and LLMs predict them accurately. Decorators look elegant but break type inference and confuse AI agents.

- **We built the compiler** — because static analysis at build time catches what runtime never could. The compiler doesn't just check your code — it generates your OpenAPI spec, route table, and app manifest.

- **We'll build the database layer** — because an ORM that doesn't share your schema language is just another seam to maintain. Same types from database to browser, no translation layer.

- **We'll build the client SDK** — because if your API is type-safe but your frontend client isn't, you've only solved half the problem.

- **We'll build whatever we have to** — a Rust runtime for the performance ceiling we need, a custom compiler pass for the guarantees we want, a new bundler for the build speed developers deserve. The vision determines the tools, not the other way around.

## For The Team

This vision exists so that every person on this team — human or AI — knows where we're headed and can make decisions that move us there.

**When you're designing an API**, ask: "Is there only one obvious way to use this? Will an LLM get it right on the first try?"

**When you're implementing a feature**, ask: "Am I writing the minimum code to deliver this behavior? Does the type system enforce correctness, or am I relying on the developer to 'just know'? Can I test this in isolation? How will I demo this?"

**When you're reviewing code**, ask: "Does this maintain our type-safety guarantees end-to-end? Does it introduce ambiguity or a second way to do something? Can I see this working, not just passing?"

**When you hit a wall**, ask: "Is this wall fundamental, or is it just the current tool's limitation?" If it's the tool, we build a better tool.

Innovation doesn't come from following the path. It comes from knowing the destination well enough to find a better route. That's what this vision is for. Know where we're going. Find better ways to get there. Challenge anything that slows us down — including our own assumptions.

---

*The only stack you need. Type-safe. LLM-native. No ceilings.*
