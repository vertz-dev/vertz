# Phase Delegation Template

Use this template when assigning an entire phase from a design doc to an agent.

---

## Phase Assignment: [Phase Name]

**Agent:** [agent-name]  
**Design Doc:** `[path/to/design-doc.md]`  
**Phase Section:** [Link to specific phase section in design doc]  
**Ticket:** #[ticket-number]  
**Dependencies:** [List any phases that must complete first, or "None"]

---

## Objective

[1-2 sentence summary of what this phase achieves]

---

## Design Constraints

Copy the key constraints from the design doc that this phase must follow:

- **[Constraint 1]:** [Description]
- **[Constraint 2]:** [Description]
- **[Constraint 3]:** [Description]

---

## Implementation Approach

From the design doc, state the **how** (not just the what):

1. [Step 1 with architectural approach]
2. [Step 2 with architectural approach]
3. [Step 3 with architectural approach]

**NOT acceptable:** "Update @vertz/schema Result type"  
**Acceptable:** "Replace duplicate Result implementation in @vertz/schema with re-exports from @vertz/errors"

---

## Success Criteria

- [ ] All tests pass (`bun run test`)
- [ ] Typecheck passes (`bun run typecheck`)
- [ ] [Phase-specific criterion 1]
- [ ] [Phase-specific criterion 2]
- [ ] Matches design doc approach (not just behavior)

---

## Files Expected to Change

Based on the design, list the files you expect to be modified:

- `[path/to/file1.ts]` — [What kind of change: add/modify/remove]
- `[path/to/file2.ts]` — [What kind of change: add/modify/remove]

**Red flag:** If the actual diff is significantly different (more files, larger changes), stop and coordinate.

---

## TDD Flow

1. [First test case to write]
2. [Implementation to make it pass]
3. [Second test case to write]
4. [Implementation to make it pass]

Or reference existing tests if they cover this phase.

---

## PR Requirements

- Title: `[type]([scope]): [short description]`
- Body: Link to design doc + this ticket + summary of changes
- Review: Cross-bot review required (you cannot review your own PR)

---

## Questions?

If anything in the design doc is unclear or conflicts with existing code, **stop and ask** before implementing. Do not interpret or assume.
