# ui-030: create-vertz-app scaffolding CLI

- **Status:** 🔴 Todo
- **Assigned:** josh (developer advocate)
- **Phase:** v0.2.0
- **Estimate:** 8h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —

## Description

Build `create-vertz-app` — the standalone scaffolding package for `npm create vertz-app` / `bun create vertz-app`.

**Full design doc:** `/workspace/vertz/plans/cli/phase-11-create-vertz-app.md`

Follow the design doc. Key points:

- Separate package at `packages/create-vertz-app/`
- Backend-only template for now (health module example)
- Include a `--template` flag (only `api` for now, but extensible for `fullstack` later)
- Interactive prompts + CI mode support
- Runtime selection (Bun default, Node, Deno)
- Must work out of the box after install + dev

## Notes

- This is the biggest DX gap for onboarding right now
- Keep it lightweight — no dependency on `@vertz/compiler`
- TDD mandatory — test cases are listed in the design doc
