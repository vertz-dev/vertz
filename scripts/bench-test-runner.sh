#!/usr/bin/env bash
set -euo pipefail

# Benchmark: Vertz Runtime vs Bun test runner
# Usage: ./scripts/bench-test-runner.sh [example-dir] [test-file]
#
# Defaults to entity-todo API tests (the tests that pass on both runners)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLE_DIR="${1:-examples/entity-todo}"
TEST_FILE="${2:-src/__tests__/api.test.ts}"
RUNTIME="$REPO_ROOT/native/target/release/vertz-runtime"
RUNS=10

cd "$REPO_ROOT/$EXAMPLE_DIR"

echo "================================================================"
echo "Benchmark: vertz-runtime test vs bun test"
echo "Example:   $EXAMPLE_DIR"
echo "Test file: $TEST_FILE"
echo "Runs:      $RUNS"
echo "Date:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Machine:   $(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo 'unknown')"
echo "================================================================"
echo ""

# --- Vertz Runtime ---
echo "=== Vertz Runtime ==="
VERTZ_TIMES=()
for i in $(seq 1 $RUNS); do
  # Use /usr/bin/time for memory measurement on last run
  if [ "$i" -eq "$RUNS" ]; then
    OUTPUT=$(/usr/bin/time -l "$RUNTIME" test "$TEST_FILE" 2>&1)
    VERTZ_RSS=$(echo "$OUTPUT" | grep "maximum resident set size" | awk '{print $1}')
    TIME_LINE=$(echo "$OUTPUT" | grep "Time:")
  else
    TIME_LINE=$("$RUNTIME" test "$TEST_FILE" 2>&1 | grep "Time:")
  fi
  MS=$(echo "$TIME_LINE" | grep -oE '[0-9]+ms' | grep -oE '[0-9]+')
  VERTZ_TIMES+=("$MS")
  echo "  Run $i: ${MS}ms"
done

# Calculate stats (discard first 2 as cold starts)
echo ""
echo "  Cold starts (discarded): ${VERTZ_TIMES[0]}ms, ${VERTZ_TIMES[1]}ms"
VERTZ_WARM=("${VERTZ_TIMES[@]:2}")
VERTZ_SUM=0
VERTZ_MIN=${VERTZ_WARM[0]}
VERTZ_MAX=${VERTZ_WARM[0]}
for t in "${VERTZ_WARM[@]}"; do
  VERTZ_SUM=$((VERTZ_SUM + t))
  [ "$t" -lt "$VERTZ_MIN" ] && VERTZ_MIN=$t
  [ "$t" -gt "$VERTZ_MAX" ] && VERTZ_MAX=$t
done
VERTZ_AVG=$((VERTZ_SUM / ${#VERTZ_WARM[@]}))
echo "  Warm avg: ${VERTZ_AVG}ms (min: ${VERTZ_MIN}ms, max: ${VERTZ_MAX}ms)"
echo "  Peak RSS: ${VERTZ_RSS:-unknown} bytes"
echo ""

# --- Bun ---
echo "=== Bun ==="
BUN_TIMES=()
for i in $(seq 1 $RUNS); do
  if [ "$i" -eq "$RUNS" ]; then
    OUTPUT=$(/usr/bin/time -l bun test "$TEST_FILE" 2>&1)
    BUN_RSS=$(echo "$OUTPUT" | grep "maximum resident set size" | awk '{print $1}')
    TIME_LINE=$(echo "$OUTPUT" | grep -oE '\[[0-9.]+ms\]')
  else
    TIME_LINE=$(bun test "$TEST_FILE" 2>&1 | grep -oE '\[[0-9.]+ms\]')
  fi
  MS=$(echo "$TIME_LINE" | grep -oE '[0-9]+' | head -1)
  BUN_TIMES+=("$MS")
  echo "  Run $i: ${MS}ms"
done

echo ""
echo "  Cold starts (discarded): ${BUN_TIMES[0]}ms, ${BUN_TIMES[1]}ms"
BUN_WARM=("${BUN_TIMES[@]:2}")
BUN_SUM=0
BUN_MIN=${BUN_WARM[0]}
BUN_MAX=${BUN_WARM[0]}
for t in "${BUN_WARM[@]}"; do
  BUN_SUM=$((BUN_SUM + t))
  [ "$t" -lt "$BUN_MIN" ] && BUN_MIN=$t
  [ "$t" -gt "$BUN_MAX" ] && BUN_MAX=$t
done
BUN_AVG=$((BUN_SUM / ${#BUN_WARM[@]}))
echo "  Warm avg: ${BUN_AVG}ms (min: ${BUN_MIN}ms, max: ${BUN_MAX}ms)"
echo "  Peak RSS: ${BUN_RSS:-unknown} bytes"
echo ""

# --- Summary ---
echo "================================================================"
echo "SUMMARY"
echo "================================================================"
echo ""
echo "| Metric | Vertz Runtime | Bun | Speedup |"
echo "|---|---|---|---|"
if [ "$BUN_AVG" -gt 0 ]; then
  SPEEDUP=$(echo "scale=1; $BUN_AVG / $VERTZ_AVG" | bc)
  echo "| Warm avg | ${VERTZ_AVG}ms | ${BUN_AVG}ms | ${SPEEDUP}x |"
fi
echo "| Min | ${VERTZ_MIN}ms | ${BUN_MIN}ms | |"
echo "| Max | ${VERTZ_MAX}ms | ${BUN_MAX}ms | |"
echo "| Peak RSS | ${VERTZ_RSS:-?} bytes | ${BUN_RSS:-?} bytes | |"
echo ""
echo "Binary sizes:"
echo "  vertz-runtime: $(ls -lh "$RUNTIME" | awk '{print $5}')"
echo "  bun: $(ls -lh "$(which bun)" | awk '{print $5}')"
