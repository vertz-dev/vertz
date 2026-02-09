# Design Doc Standards

Every new feature or significant change to vertz requires a design doc in `plans/` before implementation begins.

## Required Sections

### 1. API Surface

Show how developers will use the feature. Include concrete code examples — not pseudocode, not descriptions, actual TypeScript that demonstrates the intended usage.

Every example should compile (once the feature exists). If it won't compile, explain why and what the developer would see.

### 2. Manifesto Alignment

State which principles from `MANIFESTO.md` this design follows and what tradeoffs are accepted. Be specific:

- Which of "explicit over implicit", "convention over configuration", "compile-time over runtime", "predictability over convenience" apply?
- What alternatives were considered and rejected, and why?
- Where does this design make the LLM's job easier?

### 3. Non-Goals

What this feature deliberately won't do. This prevents scope creep and sets clear boundaries for implementation. If something is deferred to a future phase, say so explicitly.

### 4. Unknowns

Every design doc must include an Unknowns section with one of two states:

**No unknowns:**
> No unknowns identified. The team is confident this design is clear enough to implement.

**Open questions:**
A list of things that aren't clear, each with a resolution strategy:

- **Discussion-resolvable** — can be answered through conversation, no code needed
- **Needs POC** — requires a proof-of-concept to answer

### 5. POC Results

If any unknowns required a POC:

- What question the POC was trying to answer
- What was tried (link to the closed POC PR, e.g., "See POC: #42 (closed)")
- What was learned
- How the design changed based on findings

POC PRs are opened as experiments, reviewed for findings (not code quality), and closed without merging. They serve as historical records.

### 6. E2E Acceptance Test

Define the end-to-end test that validates the entire feature works as designed. This is written before any code — it's the ultimate success criterion.

Requirements:
- **Concrete and specific** — not "test that it works" but "given this input, the system produces this output"
- **From the developer's perspective** — exercise the feature as a real user would
- **Covers the happy path and key edge cases** — at minimum, the primary use case must be covered
- **Validates type safety** — include `@ts-expect-error` assertions where the compiler should reject invalid usage

This test is the final gate before a feature merges to main. If this test doesn't pass, the feature isn't done.

## Design Approval

A design doc is not approved until it receives sign-off from three perspectives:

1. **Developer experience** — Is the API intuitive? Will developers love or hate this? How do we talk about it?
2. **Product/scope** — Does this fit the roadmap? Is the scope right? Are we solving the right problem?
3. **Technical feasibility** — Can this be built as designed? Are there hidden complexities?

All three approvals are required. The design does not move to implementation until they are obtained.

## Unknowns Resolution Flow

1. Design doc lists unknowns
2. Each unknown is assessed: discussion-resolvable or needs POC
3. POCs open as PRs on `poc/` branches — review validates findings, not code quality
4. Findings written back into the design doc, referencing the closed PR
5. POC PRs closed without merging
6. Design is approved only after all unknowns are resolved or explicitly accepted as risks

## Scope

- One design doc per feature or package — never multiple unrelated features in one doc
- Design docs live in `plans/` and stay there as permanent reference
- If implementation reveals the design needs to change, the design doc is updated and re-approved (see `definition-of-done.md` for escalation rules)
