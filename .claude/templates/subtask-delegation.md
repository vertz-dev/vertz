# Subtask Delegation Template

Use this template when breaking a phase into smaller sub-tasks for parallel execution or sequential steps.

---

## Subtask: [Subtask Name]

**Agent:** [agent-name]  
**Parent Phase:** [Phase name/number]  
**Parent Ticket:** #[parent-ticket-number]  
**Design Doc:** `[path/to/design-doc.md]`  
**Depends On:** [List prerequisite subtasks, or "None"]  
**Blocks:** [List subtasks that depend on this, or "None"]

---

## Context

Why this subtask exists (relationship to parent phase):

[1-2 sentences explaining how this fits into the larger phase]

---

## Scope (What's In)

Explicitly list what this subtask should accomplish:

- [Specific change 1]
- [Specific change 2]
- [Specific change 3]

---

## Out of Scope (What's NOT In)

Explicitly list what this subtask should NOT do (to prevent scope creep):

- [Thing not included 1]
- [Thing not included 2]

---

## Design Constraints

Key constraints from the parent design doc that apply to this subtask:

- **[Constraint 1]:** [Description]
- **[Constraint 2]:** [Description]

---

## Implementation Approach

[Step-by-step approach for this specific subtask]

1. [Step 1]
2. [Step 2]
3. [Step 3]

---

## Files to Change

Expected file changes for this subtask ONLY:

- `[path/to/file1.ts]` — [What kind of change]
- `[path/to/file2.ts]` — [What kind of change]

---

## Success Criteria

- [ ] Tests pass for this subtask's scope
- [ ] Typecheck passes
- [ ] [Subtask-specific criterion 1]
- [ ] [Subtask-specific criterion 2]
- [ ] No changes outside declared scope

---

## Coordination Points

If this subtask touches files that other subtasks will also modify:

- [Coordination requirement 1]
- [Coordination requirement 2]

If conflicts arise, coordinate with [agent-name] before proceeding.

---

## Commit/PR Strategy

**Option A (PR per subtask):**
- Open PR for this subtask only
- Link to parent ticket in PR body
- Mark as draft if dependent subtasks are incomplete

**Option B (Single PR for phase):**
- Commit to shared branch: `[branch-name]`
- Commit message: `[scope]: [subtask description]`
- Do not push until coordinated with other subtask agents

[Choose one and delete the other]

---

## Questions?

If scope boundaries are unclear or conflicts arise, **coordinate immediately** before continuing.
