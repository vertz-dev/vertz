# Build in Public — Twitter/X Posts

After every PR is merged into main, generate a Twitter/X post saved to `~/vertz-dev/insights/`.

## When to Trigger

- After a PR is successfully merged (or right before creating the PR if the merge is imminent)
- The user may also ask you to generate posts retroactively for past PRs

## What to Generate

Create a markdown file at `~/vertz-dev/insights/NNNN-<slug>.md` where `NNNN` is the PR number and `<slug>` is a short kebab-case descriptor.

Each file must contain a ready-to-post Twitter/X thread (1-4 tweets).

### Context: What is vertz?

Vertz is a TypeScript backend framework designed for LLMs. The north star: "My LLM nailed it on the first try." It prioritizes type safety so that if code builds, it runs — catching mistakes at compile time, not runtime. Key beliefs: one way to do things, explicit over implicit, production-ready by default. Read `MANIFESTO.md` for the full philosophy.

### Angle — pick ONE per post, whichever is most interesting:

- **AI-assisted framework building** — how we used Claude Code to build vertz, interesting agent patterns, where AI struggled or surprised us
- **TypeScript insight** — a type trick, pattern, or gotcha we discovered while building vertz. The kind of thing that makes TS devs go "wait, you can do that?"
- **Framework design decision** — a tradeoff we made in vertz (functions over decorators, frozen objects, flat modules), why we chose it, what we gave up
- **LLM-first design** — what it means to design a framework FOR LLMs, how it changes your API surface, naming, conventions
- **Building in public** — the meta-experience of building a framework from scratch, the process, the doubts, the wins

## Format

```markdown
<!-- PR: #<number> | Date: YYYY-MM-DD -->

<Tweet 1 — the hook. Make people stop scrolling. Ask a question, state something surprising, or share a hot take.>

<Tweet 2 — the substance. What we did and why. Keep it concrete.>

<Tweet 3 (optional) — the deeper insight, tradeoff, or "here's what I learned".>

<Tweet 4 (optional) — CTA or link. "Building this in public at [repo]" or similar.>
```

## Tone & Voice

- **Write as the developer** — first person ("I", "we"), not third person
- **Conversational** — like talking to a smart dev friend, not writing a blog post
- **Opinionated** — take a stance, don't hedge everything
- **Concise** — each tweet ≤ 280 chars. No fluff. Every word earns its place
- **Target audience:** TypeScript devs, backend devs, framework builders, people interested in AI-assisted development, build-in-public crowd

## What Makes a Good Post

- **Controversial or surprising** — "unpopular opinion", "TIL", something that challenges common practice
- **Something people don't know** — a lesser-known TypeScript feature, an AI workflow trick, a non-obvious tradeoff
- **Honest about the process** — what went wrong, what we changed our mind on, where AI struggled
- **Specific** — "we used X to solve Y" beats "AI is great for coding"
- **Framework-building perspective** — most devs consume frameworks, few build them. Share what it's like from the other side

## What to Avoid

- Marketing speak, hype words ("revolutionary", "game-changing", "10x")
- Generic AI takes ("AI will change everything")
- Thread-bro formatting (numbering every tweet, "🧵" opener)
- Hashtag spam — one or two relevant hashtags max, only if natural
- Overselling small changes or underselling big ones

## Guidelines

- Read the PR diff, commit messages, and any related plan docs to understand what actually changed
- Not every PR deserves a post. If nothing is genuinely interesting, say so and skip it
- Prioritize the angle that would get the most engagement — controversy > insight > novelty > information
- The first tweet must work standalone — many people won't read the thread
