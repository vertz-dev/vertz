# Breaking Changes Policy

## Pre-v1: Breaking Changes Are Encouraged

All packages are pre-v1. There are no external users. The goal is to find the best architecture, not preserve compatibility with suboptimal decisions.

- **Don't let existing code block better design.** If a better API shape, package structure, or architecture emerges, adopt it. Refactor the existing code to match.
- **No backward-compatibility shims.** Don't add re-exports, deprecated aliases, or adapter layers to keep old code working. Change it at the source and update all consumers.
- **No migration guides for internal changes.** Update the code, update the docs, move on.
- **Consolidate aggressively.** If two packages should be one, merge them. If a function belongs in a different package, move it. Package boundaries are not sacred pre-v1.

## When to pause

The only reason to pause before a breaking change is if it affects an active PR or in-progress work by another contributor. Coordinate with the team, don't avoid the change.
