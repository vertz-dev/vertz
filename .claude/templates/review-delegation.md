# Code Review Delegation Template

Use this template when **spawning a reviewer agent** for a PR.

**CRITICAL: SPAWN THE REVIEWER - DO NOT ASK OR MENTION**

❌ **NEVER do this:**
- Add comment: "cc @username please review"
- Add comment: "Requesting review from @someone"
- Tag users in PR comments

✅ **ALWAYS do this:**
- Use `sessions_spawn` to spawn the reviewer agent
- Pass this template as the task
- Let the agent do the actual review and post it

**Pattern:**
```
sessions_spawn(
  agentId: "reviewer-name",
  task: "[Use this template filled in - see example below]",
  runTimeoutSeconds: 600
)
```

**Example:**
```typescript
sessions_spawn(
  agentId: "josh",
  task: `**ADVERSARIAL Review: PR #560**

You are josh, Developer Relations Lead. Your job is to **find what's wrong**, not approve quickly.

**PR:** https://github.com/vertz-dev/vertz/pull/560
**Author:** ben
**Phase:** Phase 5 - Codegen

**CRITICAL: Assume the author made mistakes. Your job is to protect the codebase.**

**What to look for (actively hunt for problems):**
- Does generated code match design doc approach or just outcome?
- What edge cases aren't tested?
- Are there type escapes (any, as, !) hiding unsafe code?
- What could break in production that tests don't catch?

[... rest of template filled in ...]

**Post review:**
- ✅ APPROVE only if you genuinely can't find issues
- 🔄 REQUEST CHANGES if you find problems (even minor ones)
- List EVERY concern you have

Start now. Find the mistakes.`,
  runTimeoutSeconds: 600
)
```

---

## ADVERSARIAL REVIEW MANDATE

**To the reviewer:** Your job is to **find what's wrong**, not to approve quickly.

**Assume the author made mistakes.** Your review protects the codebase from:
- Bugs that tests don't catch
- Design deviations
- Type safety issues
- Edge cases not handled
- Production breakage scenarios
- Technical debt

**Hunt for problems:**
- What edge cases weren't tested?
- Where could this break in production?
- Does this match the design doc **approach**, or just the outcome?
- What happens when inputs are null/empty/malformed?
- Are types actually safe or using `any`/`as`/`!` escapes?
- What did the author not think about?
- What assumptions aren't verified by tests?

**Default to REQUEST CHANGES if you find ANY issue - even minor ones.**

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

**Don't just check if items exist - actively look for what's missing or wrong:**

- [ ] **Tests:** All new/modified code is tested **AND** edge cases covered (null, empty, invalid, boundary values)
- [ ] **Types:** TypeScript types are correct **AND** no `any`, `as`, `!`, `@ts-ignore` escapes without justification
- [ ] **Naming:** Follows project conventions **AND** names are clear/unambiguous (no `data`, `temp`, `helper`)
- [ ] **Error handling:** Errors handled per project pattern **AND** all error paths return Result (no hidden throws)
- [ ] **Documentation:** Public APIs have TSDoc **AND** examples are correct/tested (not outdated)
- [ ] **Performance:** No obvious issues **AND** no O(n²) loops, unnecessary re-renders, or blocking operations
- [ ] **Security:** No secrets **AND** no SQL injection, XSS, command injection, or unsafe deserialization
- [ ] **Design compliance:** Implementation matches design doc **approach** (not just outcome) **AND** doesn't take shortcuts
- [ ] **Breaking changes:** Checked for unintended API breakage **AND** semver compliance
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

❌ **Mention comments** - Adding "cc @username" or "requesting review from @someone" instead of spawning the reviewer
❌ **Rubber stamping** - "Tests pass, LGTM" without checking design, edge cases, or type safety
❌ **Soft reviews** - Looking for reasons to approve instead of reasons to block
❌ **Assuming tests are correct** - Tests can pass but miss edge cases or test the wrong thing
❌ **Scope creep suggestions** - "While you're here, also add X" (file separate ticket)  
❌ **Nitpicking without blockers** - Request changes for style preferences only
❌ **Approving with unresolved blockers** - "LGTM but please fix X" (should be Request Changes)  
❌ **Ignoring design doc** - Approving because it "works" even if approach differs from design
❌ **Ignoring type escapes** - Approving code with `any`/`as`/`!` without checking if they're justified

---

## Questions During Review?

If you're unsure whether something is a blocker or within scope:

1. Check the design doc first
2. Check project conventions (RULES.md, API_CONVENTIONS.md)
3. If still unclear, **escalate to CTO/PM** instead of guessing
