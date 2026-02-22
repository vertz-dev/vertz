# Code Review Delegation Template

Use this template when requesting a code review for a PR.

**CRITICAL: Adversarial Review Mindset**

Your job is to **find what's wrong**, not to approve quickly. Assume the author made mistakes. Your review protects the codebase from bugs, design deviations, and technical debt.

**Ask yourself:**
- What edge cases weren't tested?
- Where could this break in production?
- Does this match the design doc approach, or just the outcome?
- What happens when inputs are null/empty/malformed?
- Are types actually safe or using `any`/assertions?
- What did the author not think about?

---

## Review Request: [PR Title]

**Reviewer:** [agent-name]  
**PR:** #[pr-number] ([branch-name] → [target-branch])  
**Author:** [author-agent-name]  
**Design Doc:** `[path/to/design-doc.md]` (if applicable)  
**Ticket:** #[ticket-number]  
**Phase/Subtask:** [Phase name or subtask name]

---

## What This PR Does

[1-2 sentence summary of the changes]

---

## Design Compliance Check (MANDATORY if design doc exists)

**Design doc section:** [Link to specific section]

**Key design decisions this PR should follow:**

1. **[Decision 1]:** [Description]
   - **How to verify:** [What to look for in the diff]

2. **[Decision 2]:** [Description]
   - **How to verify:** [What to look for in the diff]

3. **[Decision 3]:** [Description]
   - **How to verify:** [What to look for in the diff]

**Red flags to watch for:**
- Implementation approach differs from design (not just behavior)
- Diff size significantly larger/smaller than design suggests
- Files changed that design doc didn't mention

---

## Expected Changes

Based on the ticket/design, the reviewer should expect:

- **Files changed:** [Approx count or list]
- **Lines added:** ~[rough estimate]
- **Lines removed:** ~[rough estimate]
- **New tests:** [Yes/No + approx count]

**If actual changes differ significantly, investigate why before approving.**

---

## Technical Review Checklist (Adversarial Mindset)

**Don't just check if tests pass - actively look for what's missing:**

- [ ] **Tests:** All new/modified code is tested **AND** edge cases covered (null, empty, invalid inputs)
- [ ] **Types:** TypeScript types are correct **AND** no `any`, `as`, `@ts-ignore` escapes
- [ ] **Naming:** Follows project conventions **AND** names are clear/unambiguous
- [ ] **Error handling:** Errors handled per project pattern **AND** all error paths return Result (no hidden throws)
- [ ] **Documentation:** Public APIs have TSDoc **AND** examples are correct/tested
- [ ] **Performance:** No obvious issues **AND** no O(n²) loops, unnecessary re-renders, or blocking operations
- [ ] **Security:** No secrets **AND** no SQL injection, XSS, command injection, or unsafe deserializatio
- [ ] **Design compliance:** Implementation matches design doc approach **AND** doesn't take shortcuts
- [ ] **Breaking changes:** Checked for unintended API breakage
- [ ] **Untested assumptions:** Are there assumptions that aren't verified by tests?

---

## Quality Gates (Automated)

Verify these gates passed in CI:

- [ ] `bun run typecheck` passed
- [ ] `bun run lint` passed
- [ ] `bun run test` passed
- [ ] No unrelated files changed (check git diff)

---

## Context-Specific Concerns

[List any specific concerns for this PR based on its scope:]

- [Concern 1: e.g., "Breaking changes should match semver policy"]
- [Concern 2: e.g., "Database migrations must be reversible"]
- [Concern 3: e.g., "Public API changes need josh's DX approval"]

---

## Review Outcome Options

After reviewing, choose ONE:

### ✅ APPROVE
- All checks passed
- Design compliance verified (if applicable)
- No concerns or blockers
- Ready to merge

**Comment template:**
```
✅ LGTM

Design compliance: ✅ [verified specific approach matches design doc section X]
Technical review: ✅ [summary of what you checked]
Quality gates: ✅ All passing

[Optional: Nice work on X, clever approach to Y, etc.]
```

### 🔄 REQUEST CHANGES
- Design deviation detected
- Technical issues found
- Missing tests or documentation
- Needs author action before approval

**Comment template:**
```
🔄 Requesting changes

**Blockers:**
1. [Issue 1 with specific file/line if possible]
2. [Issue 2 with specific file/line if possible]

**Design compliance:** ❌ [Explain deviation from design doc]
OR
**Technical issues:** ❌ [List issues]

Please address these before re-requesting review.
```

### 💬 COMMENT (Non-blocking)
- Minor suggestions or questions
- Approve-worthy but has minor improvements
- Want author to address but not blocking merge

**Comment template:**
```
💬 Approved with comments

Design compliance: ✅
Technical review: ✅

**Minor suggestions:**
- [Suggestion 1]
- [Suggestion 2]

Feel free to merge or address — your call.
```

### 🛑 ESCALATE
- Unclear if design allows this approach
- Breaking change without approval
- Architectural concerns beyond your scope
- Need CTO/PM input

**Escalation template:**
```
🛑 Escalating to [CTO/PM/Architect]

I need input on [specific decision]:

**Question:** [What you're unsure about]
**Options:** [A, B, C approaches]
**My concern:** [Why you're escalating]

[Tag appropriate person]
```

---

## Anti-Patterns (DO NOT DO)

❌ **Rubber stamping** - "Tests pass, LGTM" without checking design or edge cases
❌ **Mention comments** - Adding comments like "cc @username" or "requesting review from @someone" - just do the review yourself
❌ **Soft reviews** - Looking for reasons to approve instead of reasons to block
❌ **Scope creep suggestions** - "While you're here, also add X" (file separate ticket)  
❌ **Nitpicking without blockers** - Request changes for style preferences  
❌ **Approving with unresolved blockers** - "LGTM but please fix X" (should be Request Changes)  
❌ **Ignoring design doc** - Approving because it "works" even if approach differs
❌ **Assuming tests are correct** - Tests can pass but miss edge cases or test the wrong thing

---

## Questions During Review?

If you're unsure whether something is a blocker or within scope:

1. Check the design doc first
2. Check project conventions (RULES.md, API_CONVENTIONS.md)
3. If still unclear, **escalate to CTO/PM** instead of guessing
