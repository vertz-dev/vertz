---
description: "Explain Strict TDD plugin and available commands"
allowed-tools: []
---

# Strict TDD Plugin - Help

The Strict TDD plugin enforces Test-Driven Development by cycling through three phases in a loop:

## The Cycle

```
  RED ──────> GREEN ──────> REFACTOR ──┐
  (1 test)   (minimal code) (clean up) │
  ▲                                    │
  └────────────────────────────────────┘
```

### RED - Write ONE Failing Test
- Write exactly one `it()` / `test()` block
- Run tests to confirm it fails
- No implementation code allowed

### GREEN - Make It Pass
- Write the minimum code to pass the test
- No extra functionality, no refactoring
- Run tests to confirm all pass

### REFACTOR - Clean Up
- Improve code quality, remove duplication
- No new tests, no new functionality
- Run tests after each change

## Commands

| Command | Description |
|---------|-------------|
| `/strict-tdd TASK` | Start a TDD session with a task description |
| `/cancel-tdd` | Cancel the active TDD session |
| `/help` | Show this help message |

## Options

| Option | Description |
|--------|-------------|
| `--max-cycles N` | Stop after N red-green-refactor cycles |
| `--test-cmd CMD` | Specify test command (auto-detected by default) |
| `--completion-promise TEXT` | Set a promise phrase to signal completion |

## Examples

```
/strict-tdd Implement user authentication --max-cycles 10
/strict-tdd Add form validation --test-cmd "npm test"
/strict-tdd --completion-promise 'ALL DONE' Build REST API
```

## Subagent / Manual Mode

Stop hooks don't fire inside subagents (the Task tool). To enforce TDD in subagents, call the gate script after each phase:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"
```

The gate script:
1. Reads the current phase from `.claude/strict-tdd.local.md`
2. Runs the test command
3. Validates the phase transition (RED = tests must fail, GREEN/REFACTOR = tests must pass)
4. Advances to the next phase and prints instructions

**Options:**
| Option | Description |
|--------|-------------|
| `--test-cmd CMD` | Override the test command from the state file |
| `--cwd DIR` | Set working directory for test execution |

**When to use what:**
| Context | Enforcement |
|---------|-------------|
| Main Claude Code session | Automatic (stop hook) |
| Subagent (Task tool) | Call `tdd-gate.sh` after each phase |

**Example subagent workflow:**
```
1. Write a failing test
2. bash "${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"   # validates RED, advances to GREEN
3. Write minimal implementation
4. bash "${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"   # validates GREEN, advances to REFACTOR
5. Refactor if needed
6. bash "${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"   # validates REFACTOR, advances to RED cycle 2
```

## Stopping

- Reaches `--max-cycles` limit
- Outputs `<promise>TEXT</promise>` matching the completion promise
- Manually cancel with `/cancel-tdd`
