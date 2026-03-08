# Build in Public — Twitter/X Posts

After every PR is merged into main, generate a Twitter/X post saved to `~/vertz-dev/insights/`.

## When to Trigger

- After a PR is successfully merged (or right before creating the PR if the merge is imminent)
- The user may also ask you to generate posts retroactively for past PRs

## What to Generate

Create a markdown file at `~/vertz-dev/insights/NNNN-<slug>.md` where `NNNN` is the PR number and `<slug>` is a short kebab-case descriptor.

Each file must contain a ready-to-post Twitter/X thread (1-4 tweets).

### Angle — pick ONE per post, whichever is most interesting:

- **AI-assisted framework building** — how we used Claude Code to build vertz, interesting agent patterns, where AI struggled or surprised us
- **TypeScript insight** — a type trick, pattern, or gotcha we discovered. The kind of thing that makes TS devs go "wait, you can do that?"
- **Framework design decision** — a tradeoff we made in vertz, why we chose it, what we gave up
- **LLM-first design** — what it means to design a framework FOR LLMs, how it changes your API surface
- **Building in public** — the meta-experience of building a framework from scratch

## Format

```markdown
<!-- PR: #<number> | Date: YYYY-MM-DD -->

<Tweet 1 — the hook. Make people stop scrolling.>

<Tweet 2 — the substance. What we did and why.>

<Tweet 3 (optional) — the deeper insight or tradeoff.>

<Tweet 4 (optional) — CTA or link.>
```

## Tone & Voice

- First person ("I", "we"), conversational, opinionated, concise
- Each tweet <= 280 chars. No fluff.
- Target: TypeScript devs, framework builders, AI-assisted dev, build-in-public crowd
- Prioritize: controversy > insight > novelty > information
- First tweet must work standalone

## What to Avoid

- Marketing speak, hype words ("revolutionary", "game-changing", "10x")
- Generic AI takes ("AI will change everything")
- Thread-bro formatting (numbering every tweet)
- Hashtag spam
- Not every PR deserves a post — skip if nothing is genuinely interesting
