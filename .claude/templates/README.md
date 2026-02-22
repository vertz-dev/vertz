# Delegation Templates

**All work delegation must use these templates.** No exceptions.

## Why Templates?

The Phase 1 failure (errors-as-values unification) happened because we didn't have consistent delegation:
- Design doc said "re-export from @vertz/errors"
- Implementation duplicated 200+ lines of code instead
- Review approved without checking design compliance
- Only caught when CTO manually read the code

Templates force you to think through and communicate:
- What the design doc says
- What architectural approach to use
- What files should change
- What red flags to watch for

## When to Use Each Template

### 1. `phase-delegation.md` — Assigning an entire phase

**Use when:**
- You're assigning a complete phase from a design doc to an agent
- The phase is defined in the design doc with clear scope
- This is a top-level unit of work (not a subtask)

**Example:**
- "Phase 2: Add Error Classes + matchError()" from errors-as-values design
- "Phase 1: Consolidate Result Type" from errors-as-values design

**Key sections to fill:**
- Link to design doc + specific phase section
- Design constraints from the doc
- Implementation approach (the "how", not just the "what")
- Expected files to change (use this to catch scope creep)

---

### 2. `subtask-delegation.md` — Breaking a phase into smaller pieces

**Use when:**
- A phase is too large for one agent to complete in one PR
- Multiple agents can work in parallel on independent subtasks
- You need to sequence dependent subtasks

**Example:**
- Breaking "Update Fetch Package" into:
  - Subtask A: Add error classes
  - Subtask B: Update client methods to return Result
  - Subtask C: Parse server error codes

**Key sections to fill:**
- What's IN scope for this subtask
- What's OUT of scope (prevent scope creep)
- Coordination points with other subtasks
- Commit/PR strategy (one PR per subtask vs shared branch)

---

### 3. `review-delegation.md` — Requesting code review

**Use when:**
- You've opened a PR and need another agent to review it
- Cross-bot review is required (you cannot review your own PR)

**Example:**
- "Please review PR #540 (Phase 1 implementation)"
- "Review requested for subtask A of Phase 3"

**Key sections to fill:**
- Design compliance check (if design doc exists)
- Key design decisions reviewer should verify
- Expected changes (diff size, files, lines)
- Review outcome options with templates

**CRITICAL:** Reviewer must verify design compliance, not just that tests pass.

---

## How to Use a Template

1. **Copy the template** into your delegation message (Discord DM, task assignment, etc.)
2. **Fill in ALL sections** — don't skip or leave blanks
3. **Link to design doc** — specific section, not just "see design doc"
4. **Be specific** — "re-export from @vertz/errors" not "update Result type"
5. **State constraints** — architectural decisions from design doc
6. **List expected changes** — file paths and types of changes

## Anti-Patterns (Do NOT Do)

❌ "Implement Phase 1 from the design doc" → Too vague, no constraints  
❌ "Review PR #123" → No design context, no checklist  
❌ Skipping the template because "it's a small change" → Small changes can violate design too  
❌ Copy-pasting template without filling it in → Defeats the entire purpose  

## Enforcement

- **VP Eng (mike)** will reject delegation requests that don't use templates
- **Reviewers** should push back on review requests without proper context
- **Implementers** should ask for clarification if delegation is vague

Templates aren't bureaucracy — they're the lightweight structure that prevents process theater and catches deviations early.
