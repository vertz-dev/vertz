#!/bin/bash

# Strict TDD Stop Hook
# Enforces red-green-refactor cycle by controlling phase transitions

set -eo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

STATE_FILE=".claude/strict-tdd.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# Parse YAML frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
PHASE=$(echo "$FRONTMATTER" | grep '^phase:' | sed 's/phase: *//')
CYCLE=$(echo "$FRONTMATTER" | grep '^cycle:' | sed 's/cycle: *//')
MAX_CYCLES=$(echo "$FRONTMATTER" | grep '^max_cycles:' | sed 's/max_cycles: *//')
TEST_CMD=$(echo "$FRONTMATTER" | grep '^test_cmd:' | sed 's/test_cmd: *//' | sed 's/^"\(.*\)"$/\1/')
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | grep '^completion_promise:' | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/')

# Validate state
if [[ ! "$CYCLE" =~ ^[0-9]+$ ]] || [[ ! "$MAX_CYCLES" =~ ^[0-9]+$ ]]; then
  echo "Warning: TDD state file corrupted. Stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Check max cycles (only on phase transition back to red)
if [[ "$PHASE" == "refactor" ]] && [[ $MAX_CYCLES -gt 0 ]] && [[ $CYCLE -ge $MAX_CYCLES ]]; then
  echo "Strict TDD: Max cycles ($MAX_CYCLES) reached. Session complete."
  rm "$STATE_FILE"
  exit 0
fi

# Get transcript to check last output
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

LAST_OUTPUT=""
if [[ -f "$TRANSCRIPT_PATH" ]]; then
  LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1 || true)
  if [[ -n "$LAST_LINE" ]]; then
    LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
      .message.content |
      map(select(.type == "text")) |
      map(.text) |
      join("\n")
    ' 2>/dev/null || echo "")
  fi
fi

# Check for completion promise
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")
  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    echo "Strict TDD: Completion promise detected. Session complete."
    rm "$STATE_FILE"
    exit 0
  fi
fi

# Determine next phase
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
  *)
    echo "Warning: Unknown TDD phase '$PHASE'. Stopping." >&2
    rm "$STATE_FILE"
    exit 0
    ;;
esac

# Extract prompt text (everything after closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "Warning: No task description in state file. Stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Update state file
TEMP_FILE="${STATE_FILE}.tmp.$$"
sed -e "s/^phase: .*/phase: $NEXT_PHASE/" -e "s/^cycle: .*/cycle: $NEXT_CYCLE/" "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

# Build phase-specific instructions
case "$NEXT_PHASE" in
  red)
    PHASE_LABEL="RED"
    PHASE_INSTRUCTIONS="$(cat <<'INST'
--- Phase: RED (Cycle CYCLE_NUM) ---
Task: TASK_TEXT

Write exactly ONE failing test (a single it()/test() block) that describes
the NEXT behavior you want to implement.

Rules:
- Only ONE test - not multiple
- The test must FAIL when you run it (red)
- Do NOT write any implementation code
- Run the tests to confirm the new test fails
- If all planned behaviors are implemented, you may signal completion

After writing the test and confirming it fails, stop and wait for the next phase.
INST
)"
    PHASE_INSTRUCTIONS="${PHASE_INSTRUCTIONS//CYCLE_NUM/$NEXT_CYCLE}"
    PHASE_INSTRUCTIONS="${PHASE_INSTRUCTIONS//TASK_TEXT/$PROMPT_TEXT}"
    ;;
  green)
    PHASE_INSTRUCTIONS="$(cat <<'INST'
--- Phase: GREEN (Cycle CYCLE_NUM) ---

Write the MINIMAL code to make the failing test pass.

Rules:
- Write ONLY enough code to pass the test - nothing more
- Do NOT refactor or clean up yet
- Do NOT add extra functionality
- Do NOT write additional tests
- Run the tests to confirm ALL tests pass (green)

After making the test pass, stop and wait for the refactor phase.
INST
)"
    PHASE_LABEL="GREEN"
    PHASE_INSTRUCTIONS="${PHASE_INSTRUCTIONS//CYCLE_NUM/$CYCLE}"
    ;;
  refactor)
    PHASE_INSTRUCTIONS="$(cat <<'INST'
--- Phase: REFACTOR (Cycle CYCLE_NUM) ---

Clean up the code while keeping ALL tests green.

Rules:
- Improve code quality, remove duplication, improve naming
- Do NOT add new functionality
- Do NOT write new tests
- Run tests after each change to confirm they still pass
- If no refactoring is needed, just confirm tests pass and move on

After refactoring (or deciding none is needed), stop to start the next RED phase.
INST
)"
    PHASE_LABEL="REFACTOR"
    PHASE_INSTRUCTIONS="${PHASE_INSTRUCTIONS//CYCLE_NUM/$CYCLE}"
    ;;
esac

# Build system message
CYCLE_INFO="Cycle $NEXT_CYCLE"
if [[ $MAX_CYCLES -gt 0 ]]; then
  CYCLE_INFO="Cycle $NEXT_CYCLE / $MAX_CYCLES"
fi

if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  PROMISE_INFO=" | Complete: <promise>$COMPLETION_PROMISE</promise>"
else
  PROMISE_INFO=""
fi

SYSTEM_MSG="TDD [$PHASE_LABEL] | $CYCLE_INFO$PROMISE_INFO"

# Output JSON to block exit and feed next phase
jq -n \
  --arg reason "$PHASE_INSTRUCTIONS" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $reason,
    "systemMessage": $msg
  }'

exit 0
