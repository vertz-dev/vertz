# Your AI subagents don't follow the rules — here's how we fixed it

**Commit:** `6761bb1`
**Branch:** `main`
**Date:** 2026-02-05

## What changed

Added a `tdd-gate.sh` script to the strict-tdd plugin that validates TDD phase transitions by running tests and checking results. This enables strict red-green-refactor enforcement inside subagents (Claude Code's Task tool), where stop hooks don't fire.

## Why it matters

If you're using AI agents to write code with TDD discipline, you hit a wall the moment you delegate to a subagent. Stop hooks — the mechanism that enforces "you wrote a failing test, now write the implementation" — simply don't exist in subprocess contexts. The agent can write three tests, skip refactoring, and nobody stops it. The whole point of strict TDD tooling breaks down exactly where you need it most: autonomous, unsupervised work.

## The interesting bit

The gate script is essentially a pull-based version of the push-based stop hook. Same state file, same phase validation logic, same transition rules — but the agent calls it explicitly instead of being interrupted by it. The tradeoff is trust: in the main session, enforcement is automatic and unavoidable. In subagents, the agent has to voluntarily call the gate after each phase. It's the honor system backed by a bouncer. We chose this over trying to hack hook-like behavior into subprocesses because it's simple, testable, and the instruction prompt can just say "call the gate after each phase." The agent either follows the instructions or it doesn't — and if it doesn't, the state file makes it obvious where it went off-script.

## One-liner

Stop hooks don't fire in subagents, so we built a gate script that agents call between TDD phases to keep themselves honest.
