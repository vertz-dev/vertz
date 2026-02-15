# Contributing to Vertz

Thanks for your interest in Vertz! We're building this framework in public and value community input.

## How to Contribute

Right now, the best ways to contribute are:

### Open an Issue

- **Bug reports** — Found something broken? Open an issue with steps to reproduce.
- **Feature requests** — Have an idea? We want to hear it.
- **Questions & discussion** — Not sure about a design decision? Ask.

### Join the Conversation

We plan features in the open via PRs with design docs and implementation plans. Browse [open PRs](https://github.com/vertz-dev/vertz/pulls) and leave comments — your perspective on API design, tradeoffs, and developer experience is valuable.

### Code Contributions

We're not accepting code PRs at this stage. The codebase follows a strict workflow (design doc, implementation plan, TDD) and is actively being built by the core team. This will change as the framework matures.

If you're interested in contributing code in the future, the best way to prepare is to follow the project and participate in design discussions.

## Development Setup

If you want to run the project locally:

```bash
# Requires Bun (https://bun.sh)
git clone https://github.com/vertz-dev/vertz.git
cd vertz
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint
```

## Project Structure

```
packages/
  schema/      # @vertz/schema — validation and type inference
  server/      # @vertz/server — HTTP framework, modules, middleware
  compiler/    # @vertz/compiler — static analysis and code generation
  testing/     # @vertz/testing — integration test utilities
plans/         # Design docs and implementation plans
```

## Code Conventions

- **TypeScript strict mode** — all strict flags enabled, no `any`
- **Biome** for formatting and linting
- **Strict TDD** — every behavior has a failing test before implementation
- **One PR per feature/phase** — atomic, reviewable changes

## Links

- [README](./README.md) — Project overview
- [Manifesto](./MANIFESTO.md) — Philosophy and design principles
- [Design docs](./plans/) — Architecture and implementation plans
