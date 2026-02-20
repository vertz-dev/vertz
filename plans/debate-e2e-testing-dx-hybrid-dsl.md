# Position Paper: The Case for a Hybrid DSL in E2E Testing

## 1. What Writing a Test Looks Like

Tests are written in a lightweight, structured DSL that reads like English but carries machine-parseable intent:

```vertz
Test: User login flow

Step: Navigate to login page
  url: https://app.example.com/login

Step: Enter credentials
  fill: "email" with "user@example.com"
  fill: "password" with "secure123"

Step: Submit form
  click: "Login button"

Step: Verify dashboard loads
  expect: "Welcome, User" in "header"
  waitFor: "#dashboard" visible
```

This is readable by anyone—PMs, designers, QA. No Cypress/Playwright API knowledge required. Yet each line has structured semantics the agent can act on with high confidence.

## 2. What Running a Test Looks Like

**Flow:**
1. Parser validates DSL → AST
2. Agent-browser receives structured steps + current DOM snapshot
3. For each step, agent translates intent to Playwright actions
4. Every action produces a **deterministic artifact** (see section 4)
5. On replay: artifact runs directly—zero LLM cost

The magic: the first run is AI-assisted (slow, expensive), but subsequent runs are deterministic replay (fast, cheap). Only failed steps trigger fresh AI execution for self-healing.

## 3. What Debugging a Failure Looks Like

When a test fails, the developer sees:

```
Step: Enter credentials
  fill: "email" with "user@example.com"
  ✗ FAILED: Element not found

Snapshot: [screenshot showing login form]
Expected: input[name="email"]
Found:   input#email (no name attribute)
```

Clear, actionable. Not a cryptic "element not found" from Playwright. The failure includes the actual DOM snapshot, what the DSL expected, and what the agent found. Developers can fix the DSL, the app, or let the agent re-execute just that step.

## 4. What the Persisted Deterministic Artifact Looks Like

```json
{
  "testId": "user-login-001",
  "version": "1.0",
  "steps": [
    {
      "index": 0,
      "dsl": "url: https://app.example.com/login",
      "action": { "kind": "goto", "url": "https://app.example.com/login" },
      "snapshot": "base64...",
      "status": "success"
    },
    {
      "index": 1,
      "dsl": "fill: \"email\" with \"user@example.com\"",
      "action": {
        "kind": "fill",
        "selector": "input#email",
        "value": "user@example.com"
      },
      "elementSnapshot": "base64...",
      "status": "success"
    }
  ]
}
```

This artifact is **replayable**. It contains concrete selectors the agent discovered, not the fuzzy DSL intent. It's what makes replay fast and cheap.

## 5. Key DX Principles

**Better than Cypress/Playwright:**
- Anyone can write tests—no JavaScript/TypeScript knowledge needed
- Agent handles selector discovery (no more `getByRole`, `locator('#id')` guessing)
- Self-healing: broken steps regenerate without rewriting the whole test

**Better than pure natural language:**
- Unambiguous: "fill: email with X" ≠ "type in the email field"
- Structured: parser catches errors before execution
- Efficient: agent knows exactly what intent signals matter
- Versionable: DSL diffs are clean, readable code reviews

The DSL is the **contract** between human intent and machine execution.

## 6. Risks and Tradeoffs

- **Learning curve**: Still requires learning DSL syntax (though minimal)
- **Expressiveness ceiling**: Some complex flows may need escape hatches to raw JS
- **DSL maintenance**: As the framework evolves, DSL may drift from agent capabilities
- **Tooling investment**: Need a parser, validator, IDE extensions—upfront cost

These are real costs. But they're paid once. The payoff: tests that are readable, maintainable, and cheap to run at scale.

---

**Bottom line:** Natural language is great for ideas. Structured DSL is great for execution. Vertz gets both.
