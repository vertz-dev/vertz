---
description: "Start a Strict TDD session (red-green-refactor loop)"
argument-hint: "TASK [--max-cycles N] [--test-cmd CMD] [--completion-promise TEXT]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/setup-tdd.sh:*)"]
hide-from-slash-command-tool: "true"
---

# Strict TDD Session

Execute the setup script to initialize the TDD loop:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/setup-tdd.sh" $ARGUMENTS
```

You are now in a Strict TDD session. Follow the red-green-refactor cycle exactly:

**Phase Rules:**
- **RED**: Write exactly ONE failing test (`it()` or `test()` block) for a single behavior. Run tests to confirm it fails. Do NOT write implementation code.
- **GREEN**: Write the MINIMAL code to make the failing test pass. Run tests to confirm ALL tests pass. Do NOT add extra functionality.
- **REFACTOR**: Clean up code while keeping all tests green. Do NOT add new functionality or new tests.

**Enforcement modes:**
- **Main session (automatic):** The stop hook enforces each phase. Complete the current phase, then stop to receive the next phase instructions.
- **Subagents / Task tool (manual):** Stop hooks don't fire inside subagents. After each phase, call the gate script to validate and advance:
  ```
  bash "${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"
  ```
  The gate script runs tests, validates your phase transition, and prints next-phase instructions.

CRITICAL: Never write implementation code without a failing test. Never write multiple tests at once. Each cycle handles ONE behavior.
