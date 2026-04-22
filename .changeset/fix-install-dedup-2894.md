---
'@vertz/runtime': patch
---

fix(vtz): dedup redundant package versions when a single version satisfies every declared range

Closes [#2894](https://github.com/vertz-dev/vertz/issues/2894).

`vtz install` used to nest a transitive copy of a package even when the root's already-hoisted version satisfied the transitive range. Scenario that triggered it: a root exact pin (`"@vertz/schema": "0.2.73"`) plus a transitive range (`"^0.2.68"` declared by `@vertz/agents`) produced two graph entries — 0.2.73 at root, 0.2.76 nested under `node_modules/@vertz/agents/node_modules/@vertz/schema/`. The resolver's BFS treated the two distinct range strings as separate resolution tasks and never checked whether they could share a version.

TypeScript's structural typing treats module identity by file path, so any exported type with a private/protected field (including `ParseContext` in `@vertz/schema`) became two incompatible types — one per path — and consumers hit opaque `Types have separate declarations of a private property` errors at compile time.

Fix: a new `resolver::dedup()` pass runs before `hoist()`. For each package name with multiple versions, it collects every declared range (root deps + every transitive `dependencies`/`optionalDependencies`) and, when a single version in the graph satisfies all of them, drops the redundant versions. Packages with any non-semver range (`github:`, `link:`, dist-tags) are skipped — they can't be reasoned about from the range string alone. When no version satisfies every range, the graph is left untouched and the existing hoist algorithm decides nesting as before.
