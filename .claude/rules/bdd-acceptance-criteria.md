# BDD Acceptance Criteria Guide

> Guide for writing BDD-style acceptance criteria in design docs and GitHub issues. Use Given/When/Then scenarios to make requirements executable and testable.

---

## When to Use BDD

**Use BDD scenarios for:**
- Feature-level issues (P0, P1)
- Design doc phases
- Any issue that will be assigned to an agent
- Complex user workflows
- API surface changes

**Do NOT use BDD for:**
- Typo fixes
- Config changes
- Simple chores
- Issues where a checklist is clearer

---

## Format

Use vitest-compatible Given/When/Then in `describe`/`it` blocks:

```typescript
describe('Feature: Domain API validation', () => {
  describe('Given a domain with a string schema', () => {
    describe('When creating an entity with invalid data', () => {
      it('Then returns an error result with validation details', () => {
        // test implementation
      })
    })
  })
})
```

### Structure Rules

1. **`describe` blocks nest logically:** Feature → Given state → When action → Then outcome
2. **One behavior per `it` block:** Each test should verify a single outcome
3. **Use present tense:** "returns" not "returned" or "will return"
4. **Be specific:** "returns an error with message" not "handles errors"

---

## Writing Good Scenarios

### 1. One Behavior Per Scenario

**❌ BAD:** Tests too many things at once
```typescript
it('validates input, returns errors, and logs the failure', () => {
  // Too much!
})
```

**✅ GOOD:** Single behavior per test
```typescript
it('returns validation errors for invalid input', () => {})
it('logs validation failures to error stream', () => {})
```

### 2. Use Concrete Examples

**❌ BAD:** Abstract description
```typescript
describe('Given invalid data', () => {
  it('then handles it correctly', () => {})
})
```

**✅ GOOD:** Concrete, specific scenario
```typescript
describe('Given a domain with string schema and numeric value "123"', () => {
  describe('When validating the value', () => {
    it('then returns error with message "expected string, got number"', () => {})
  })
})
```

### 3. Include Happy Path AND Error Paths

**Every feature needs both:**

```typescript
describe('Feature: User authentication', () => {
  describe('Given valid credentials', () => {
    describe('When calling authenticate()', () => {
      it('then returns a valid session token', () => {})
    })
  })

  describe('Given invalid credentials', () => {
    describe('When calling authenticate()', () => {
      it('then returns an authentication error', () => {})
    })
  })
})
```

### 4. Reference Actual API Names

Use real method names from your codebase. Reference `API_CONVENTIONS.md` for naming patterns.

**❌ BAD:** Generic description
```typescript
describe('Given user input', () => {
  describe('when processing', () => {
    it('works correctly', () => {})
  })
})
```

**✅ GOOD:** Uses actual API names
```typescript
describe('Given a createUser() input with missing email', () => {
  describe('When calling createUser()', () => {
    it('then returns ValidationError with "email is required"', () => {})
  })
})
```

---

## Integration with Workflow

### Design Docs

Each phase in a design doc includes BDD scenarios as acceptance criteria:

```markdown
## Phase 1: Basic Validation

### Acceptance Criteria
```typescript
describe('Feature: Input validation', () => {
  describe('Given a valid input', () => {
    describe('When calling validate()', () => {
      it('then returns { valid: true }', () => {})
    })
  })

  describe('Given an invalid input', () => {
    describe('When calling validate()', () => {
      it('then returns { valid: false, errors: [...] }', () => {})
    })
  })
})
```

### GitHub Issues

P0/P1 issues include BDD scenarios in the issue body:

```markdown
## Acceptance Criteria

### Must Have
```typescript
describe('Feature: Health check endpoint', () => {
  describe('Given a healthy database', () => {
    describe('When GET /health is called', () => {
      it('then returns 200 with { status: "healthy" }', () => {})
    })
  })
})
```

### Nice to Have
- [ ] Connection latency included in response
```

### Agent Spawning

BDD scenarios become the first tests the agent writes (red phase in TDD):

1. Agent reads issue with BDD scenarios
2. Agent writes failing tests matching scenarios (red)
3. Agent implements to make tests pass (green)
4. Agent refactors while staying green
5. All scenarios pass = feature done

### Definition of Done

A feature is done when:
- [ ] All BDD scenarios pass
- [ ] Quality gates green (`bun test && bun run typecheck && bun run lint`)
- [ ] PR reviewed and merged
- [ ] Developer Walkthrough passes

---

## Examples

### Example 1: Simple API Method

```typescript
describe('Feature: Database connection', () => {
  describe('Given a valid connection string', () => {
    describe('When connect() is called', () => {
      it('then returns a connected Database instance', () => {})
      it('then connection is persisted in pool', () => {})
    })
  })

  describe('Given an invalid connection string', () => {
    describe('When connect() is called', () => {
      it('then throws ConnectionError with descriptive message', () => {})
      it('then does not add to connection pool', () => {})
    })
  })
})
```

### Example 2: Configuration Option

```typescript
describe('Feature: Retry configuration', () => {
  describe('Given maxRetries is set to 3', () => {
    describe('When a transient error occurs', () => {
      it('then retries exactly 3 times', () => {})
      it('then throws after all retries fail', () => {})
    })
  })

  describe('Given maxRetries is set to 0', () => {
    describe('When a transient error occurs', () => {
      it('then throws immediately without retry', () => {})
    })
  })
})
```

### Example 3: Event Handling

```typescript
describe('Feature: Event emission', () => {
  describe('Given a listener is registered for "update"', () => {
    describe('When emit("update", data) is called', () => {
      it('then calls the listener with data', () => {})
      it('then returns true', () => {})
    })
  })

  describe('Given no listeners registered', () => {
    describe('When emit("update", data) is called', () => {
      it('then returns false', () => {})
      it('then does not throw', () => {})
    })
  })
})
```

---

## Common Mistakes

| Mistake | Why It's Bad | Fix |
|---------|--------------|-----|
| Testing implementation details | Brittle, breaks on refactor | Test behavior, not internals |
| Too many assertions in one test | Unclear what failed | One `it` = one assertion |
| Missing error cases | Incomplete coverage | Always include failure paths |
| Using "should" | Ambiguous language | Use "then" for outcomes |
| Abstract scenarios | Not actionable | Use concrete examples |
| No Given state | Unclear context | Always specify preconditions |

---

## Related Documents

- [TDD Workflow](./tdd.md) — Red→Green→Refactor process
- [Design & Planning](./design-and-planning.md) — Design doc requirements and definition of done
