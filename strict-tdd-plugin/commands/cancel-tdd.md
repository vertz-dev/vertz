---
description: "Cancel active Strict TDD session"
allowed-tools: ["Bash(test -f .claude/strict-tdd.local.md:*)", "Bash(rm .claude/strict-tdd.local.md)", "Read(.claude/strict-tdd.local.md)"]
hide-from-slash-command-tool: "true"
---

# Cancel TDD Session

To cancel the Strict TDD session:

1. Check if `.claude/strict-tdd.local.md` exists using Bash: `test -f .claude/strict-tdd.local.md && echo "EXISTS" || echo "NOT_FOUND"`

2. **If NOT_FOUND**: Say "No active TDD session found."

3. **If EXISTS**:
   - Read `.claude/strict-tdd.local.md` to get the current cycle and phase from the frontmatter
   - Remove the file using Bash: `rm .claude/strict-tdd.local.md`
   - Report: "Cancelled TDD session (was at cycle N, phase PHASE)"
