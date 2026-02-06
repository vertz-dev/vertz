#!/bin/bash

# Strict TDD Setup Script
# Creates state file for TDD phase tracking

set -eo pipefail

# Parse arguments
PROMPT_PARTS=()
MAX_CYCLES=0
TEST_CMD=""
COMPLETION_PROMISE="null"

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << 'HELP_EOF'
Strict TDD - One Test at a Time

USAGE:
  /strict-tdd [TASK...] [OPTIONS]

ARGUMENTS:
  TASK...    Description of the feature/behavior to implement

OPTIONS:
  --max-cycles <n>               Maximum red-green-refactor cycles (default: unlimited)
  --test-cmd <cmd>               Test command to run (default: auto-detect)
  --completion-promise '<text>'   Promise phrase to signal completion
  -h, --help                     Show this help message

DESCRIPTION:
  Enforces strict TDD by cycling through phases:
    1. RED    - Write exactly ONE failing test
    2. GREEN  - Write MINIMAL code to make it pass
    3. REFACTOR - Clean up, keeping tests green

  Each phase is enforced by a stop hook that blocks exit
  and feeds back phase-specific instructions.

EXAMPLES:
  /strict-tdd Implement user authentication --max-cycles 10
  /strict-tdd Add shopping cart feature --test-cmd "npm test"
  /strict-tdd --completion-promise 'ALL FEATURES DONE' Build REST API

STOPPING:
  - Set --max-cycles to limit iterations
  - Set --completion-promise and output <promise>TEXT</promise> when done
  - Use /cancel-tdd to cancel the session
HELP_EOF
      exit 0
      ;;
    --max-cycles)
      if [[ -z "${2:-}" ]] || ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --max-cycles requires a positive integer" >&2
        exit 1
      fi
      MAX_CYCLES="$2"
      shift 2
      ;;
    --test-cmd)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --test-cmd requires a command string" >&2
        exit 1
      fi
      TEST_CMD="$2"
      shift 2
      ;;
    --completion-promise)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --completion-promise requires a text argument" >&2
        exit 1
      fi
      COMPLETION_PROMISE="$2"
      shift 2
      ;;
    *)
      PROMPT_PARTS+=("$1")
      shift
      ;;
  esac
done

# Join prompt parts - handle empty array safely
PROMPT="${PROMPT_PARTS[*]:-}"

if [[ -z "$PROMPT" ]]; then
  echo "Error: No task description provided" >&2
  echo "" >&2
  echo "  Examples:" >&2
  echo "    /strict-tdd Implement user authentication" >&2
  echo "    /strict-tdd Add shopping cart --max-cycles 10" >&2
  exit 1
fi

# Auto-detect test command if not specified
if [[ -z "$TEST_CMD" ]]; then
  if [[ -f "package.json" ]]; then
    if grep -q '"test"' package.json 2>/dev/null; then
      TEST_CMD="npm test"
    fi
  elif [[ -f "Makefile" ]]; then
    if grep -q '^test:' Makefile 2>/dev/null; then
      TEST_CMD="make test"
    fi
  elif [[ -f "pytest.ini" ]] || [[ -f "setup.py" ]] || [[ -f "pyproject.toml" ]]; then
    TEST_CMD="pytest"
  elif [[ -f "Cargo.toml" ]]; then
    TEST_CMD="cargo test"
  elif [[ -f "go.mod" ]]; then
    TEST_CMD="go test ./..."
  fi

  if [[ -z "$TEST_CMD" ]]; then
    TEST_CMD="auto"
  fi
fi

# Quote completion promise for YAML
if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]]; then
  COMPLETION_PROMISE_YAML="\"$COMPLETION_PROMISE\""
else
  COMPLETION_PROMISE_YAML="null"
fi

# Create state file
mkdir -p .claude

cat > .claude/strict-tdd.local.md <<EOF
---
active: true
phase: red
cycle: 1
max_cycles: $MAX_CYCLES
test_cmd: "$TEST_CMD"
completion_promise: $COMPLETION_PROMISE_YAML
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---

$PROMPT
EOF

# Output setup message
cat <<EOF
=== Strict TDD Session Started ===

Task: $PROMPT
Phase: RED (write ONE failing test)
Cycle: 1$(if [[ $MAX_CYCLES -gt 0 ]]; then echo " / $MAX_CYCLES"; fi)
Test command: $TEST_CMD
Completion: $(if [[ "$COMPLETION_PROMISE" != "null" ]]; then echo "$COMPLETION_PROMISE"; else echo "manual (/cancel-tdd)"; fi)

--- TDD Rules ---
1. RED:      Write exactly ONE failing test for a single behavior
2. GREEN:    Write the MINIMAL code to make that test pass
3. REFACTOR: Clean up while keeping all tests green
4. REPEAT:   Back to RED with the next behavior

--- Enforcement ---
Main session: The stop hook enforces each phase automatically.
Subagents:    Call the gate script after each phase:
              bash "\${CLAUDE_PLUGIN_ROOT}/scripts/tdd-gate.sh"

--- Phase: RED ---
Write exactly ONE failing test (a single it() block) that describes
the next behavior you want to implement. Then run the tests to
confirm it fails. Do NOT write any implementation code yet.
EOF

if [[ "$COMPLETION_PROMISE" != "null" ]]; then
  echo ""
  echo "To complete: output <promise>$COMPLETION_PROMISE</promise> when TRUE"
fi

echo ""
echo "$PROMPT"
