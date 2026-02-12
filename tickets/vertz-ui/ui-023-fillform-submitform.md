# ui-023: Add fillForm/submitForm test utilities

- **Status:** 🔴 Todo
- **Assigned:** ava
- **Phase:** v0.1.x patch
- **Estimate:** 4h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** josh DX review on PR #199 (noting #7), design doc examples

## Description

The design doc shows `fillForm` and `submitForm` test utilities in examples, but they were never implemented. No phase owned them, and no follow-up was created during implementation.

These utilities should be added to `@vertz/ui/test` to match the design doc promise.

**File:** `packages/ui/src/test/index.ts`

## Acceptance Criteria

- [ ] `fillForm(form, data)` fills form fields by name with provided values
- [ ] `submitForm(form)` triggers form submission
- [ ] Test: fillForm populates text inputs, selects, textareas
- [ ] Test: submitForm triggers the form's submit handler
- [ ] Both utilities exported from `@vertz/ui/test`
- [ ] Design doc examples using fillForm/submitForm work as shown

## Progress

- 2026-02-12: Ticket created from josh's DX review on PR #199
