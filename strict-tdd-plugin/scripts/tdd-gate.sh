#!/bin/bash

# TDD Gate Script
# Validates phase transitions and advances the TDD cycle.
# Use this in subagents (Task tool) where stop hooks don't fire.
#
# Usage: tdd-gate.sh [--test-cmd CMD] [--cwd DIR]

set -eo pipefail

# Defaults
OVERRIDE_TEST_CMD=""
OVERRIDE_CWD=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --test-cmd)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --test-cmd requires a command string" >&2
        exit 1
      fi
      OVERRIDE_TEST_CMD="$2"
      shift 2
      ;;
    --cwd)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --cwd requires a directory path" >&2
        exit 1
      fi
      OVERRIDE_CWD="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'HELP'
TDD Gate — Phase transition validator

USAGE:
  tdd-gate.sh [--test-cmd CMD] [--cwd DIR]

OPTIONS:
  --test-cmd CMD   Override the test command from the state file
  --cwd DIR        Set working directory for test execution
  -h, --help       Show this help message

DESCRIPTION:
  Reads .claude/strict-tdd.local.md, runs the test command, validates
  the result against the current phase, advances to the next phase,
  and prints instructions for the next phase.

  Phase validation:
    RED      — tests MUST have failures (exit != 0)
    GREEN    — ALL tests MUST pass (exit == 0)
    REFACTOR — ALL tests MUST pass (exit == 0)

  Call this after completing each TDD phase inside a subagent.
HELP
      exit 0
      ;;
    *)
      echo "Error: Unknown argument '$1'" >&2
      exit 1
      ;;
  esac
done

# Change to working directory if specified
if [[ -n "$OVERRIDE_CWD" ]]; then
  if [[ ! -d "$OVERRIDE_CWD" ]]; then
    echo "Error: Directory '$OVERRIDE_CWD' does not exist" >&2
    exit 1
  fi
  cd "$OVERRIDE_CWD"
fi

# --- Read state file ---
STATE_FILE=".claude/strict-tdd.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "Error: No active TDD session. State file not found: $STATE_FILE" >&2
  echo "Start a session with: /strict-tdd TASK" >&2
  exit 1
fi

# Parse YAML frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
ACTIVE=$(echo "$FRONTMATTER" | grep '^active:' | sed 's/active: *//')
PHASE=$(echo "$FRONTMATTER" | grep '^phase:' | sed 's/phase: *//')
CYCLE=$(echo "$FRONTMATTER" | grep '^cycle:' | sed 's/cycle: *//')
MAX_CYCLES=$(echo "$FRONTMATTER" | grep '^max_cycles:' | sed 's/max_cycles: *//')
TEST_CMD=$(echo "$FRONTMATTER" | grep '^test_cmd:' | sed 's/test_cmd: *//' | sed 's/^"\(.*\)"$/\1/')
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | grep '^completion_promise:' | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/')

# Validate state
if [[ "$ACTIVE" != "true" ]]; then
  echo "Error: TDD session is not active" >&2
  exit 1
fi

if [[ ! "$CYCLE" =~ ^[0-9]+$ ]] || [[ ! "$MAX_CYCLES" =~ ^[0-9]+$ ]]; then
  echo "Error: TDD state file corrupted (invalid cycle/max_cycles)" >&2
  exit 1
fi

if [[ -z "$PHASE" ]] || [[ ! "$PHASE" =~ ^(red|green|refactor)$ ]]; then
  echo "Error: TDD state file corrupted (invalid phase: '$PHASE')" >&2
  exit 1
fi

# Apply test command override
if [[ -n "$OVERRIDE_TEST_CMD" ]]; then
  TEST_CMD="$OVERRIDE_TEST_CMD"
fi

if [[ -z "$TEST_CMD" ]] || [[ "$TEST_CMD" == "auto" ]]; then
  echo "Error: No test command configured. Use --test-cmd or set test_cmd in state file." >&2
  exit 1
fi

# --- Run tests ---
echo "=== TDD Gate: Phase $PHASE (Cycle $CYCLE) ==="
echo "Running: $TEST_CMD"
echo ""

TEST_OUTPUT=""
TEST_EXIT=0
TEST_OUTPUT=$(eval "$TEST_CMD" 2>&1) || TEST_EXIT=$?

echo "$TEST_OUTPUT"
echo ""

# --- Validate phase transition ---
case "$PHASE" in
  red)
    if [[ $TEST_EXIT -eq 0 ]]; then
      echo "=== GATE FAILED ==="
      echo "Phase RED requires at least one failing test, but all tests passed."
      echo "Write a failing test first, then call the gate again."
      exit 1
    fi
    echo "=== Gate passed: tests have failures (expected in RED) ==="
    ;;
  green)
    if [[ $TEST_EXIT -ne 0 ]]; then
      echo "=== GATE FAILED ==="
      echo "Phase GREEN requires all tests to pass, but some tests are failing."
      echo "Fix the implementation to make all tests pass, then call the gate again."
      exit 1
    fi
    echo "=== Gate passed: all tests pass (expected in GREEN) ==="
    ;;
  refactor)
    if [[ $TEST_EXIT -ne 0 ]]; then
      echo "=== GATE FAILED ==="
      echo "Phase REFACTOR requires all tests to pass, but refactoring broke something."
      echo "Fix the refactoring to keep all tests green, then call the gate again."
      exit 1
    fi
    echo "=== Gate passed: all tests still pass after refactoring ==="
    ;;
esac

# --- Check max cycles before transitioning from refactor to red ---
if [[ "$PHASE" == "refactor" ]] && [[ $MAX_CYCLES -gt 0 ]] && [[ $CYCLE -ge $MAX_CYCLES ]]; then
  echo ""
  echo "=== TDD Session Complete ==="
  echo "Reached max cycles ($MAX_CYCLES). Session finished."
  rm "$STATE_FILE"
  exit 0
fi

# --- Compute next phase ---
case "$PHASE" in
  red)
    NEXT_PHASE="green"
    NEXT_CYCLE=$CYCLE
    ;;
  green)
    NEXT_PHASE="refactor"
    NEXT_CYCLE=$CYCLE
    ;;
  refactor)
    NEXT_PHASE="red"
    NEXT_CYCLE=$((CYCLE + 1))
    ;;
esac

# Extract prompt text (everything after closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")

# --- Update state file ---
TEMP_FILE="${STATE_FILE}.tmp.$$"
sed -e "s/^phase: .*/phase: $NEXT_PHASE/" -e "s/^cycle: .*/cycle: $NEXT_CYCLE/" "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

# --- Print next-phase instructions ---
echo ""

CYCLE_INFO="Cycle $NEXT_CYCLE"
if [[ $MAX_CYCLES -gt 0 ]]; then
  CYCLE_INFO="Cycle $NEXT_CYCLE / $MAX_CYCLES"
fi

case "$NEXT_PHASE" in
  red)
    cat <<INST
--- Phase: RED ($CYCLE_INFO) ---
Task: $PROMPT_TEXT

Write exactly ONE failing test (a single it()/test() block) that describes
the NEXT behavior you want to implement.

Rules:
- Only ONE test - not multiple
- The test must FAIL when you run it (red)
- Do NOT write any implementation code
- Run the tests to confirm the new test fails
- If all planned behaviors are implemented, you may signal completion

After writing the test and confirming it fails, call the gate again:
  bash "\${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"
INST
    ;;
  green)
    cat <<INST
--- Phase: GREEN ($CYCLE_INFO) ---

Write the MINIMAL code to make the failing test pass.

Rules:
- Write ONLY enough code to pass the test - nothing more
- Do NOT refactor or clean up yet
- Do NOT add extra functionality
- Do NOT write additional tests
- Run the tests to confirm ALL tests pass (green)

After making the test pass, call the gate again:
  bash "\${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"
INST
    ;;
  refactor)
    cat <<INST
--- Phase: REFACTOR ($CYCLE_INFO) ---

Clean up the code while keeping ALL tests green.

Rules:
- Improve code quality, remove duplication, improve naming
- Do NOT add new functionality
- Do NOT write new tests
- Run tests after each change to confirm they still pass
- If no refactoring is needed, just confirm tests pass and move on

After refactoring (or deciding none is needed), call the gate again:
  bash "\${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"
INST
    ;;
esac

if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  echo ""
  echo "To complete: output <promise>$COMPLETION_PROMISE</promise> when TRUE"
fi
