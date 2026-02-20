# Position Paper: Type-Safe Programmatic E2E Testing for Vertz

## 1. What Writing a Test Looks Like

Tests are TypeScript using intent-based actions. No selectors. Just describe what you want.

```typescript
import { test, expect, goto, click, type, waitFor, see } from '@vertz/testing';

test('User can login and see dashboard', async () => {
  // Navigate to app
  await goto('/login');
  
  // Fill form using intent (AI resolves to correct fields)
  await type(emailInput, 'user@example.com');
  await type(passwordInput, 'secret123');
  
  // Submit and verify
  await click(submitButton);
  await waitFor(dashboard);
  
  // Assert state
  await expect(see('Welcome, user@example.com')).toBeVisible();
});
```

Notice: `emailInput`, `passwordInput` are **type-safe identifiers**, not selectors. The AI resolves these to stable selectors at generation time.

## 2. What Running a Test Looks Like

**First run (generation phase):**
```
$ vertz test login.spec.ts

→ Loading intent-based test...
→ AI Agent analyzing page state...
→ Resolving emailInput → [data-testid="email"], [name="email"]  
→ Resolving passwordInput → [data-testid="password"], [name="password"]
→ Executing steps with AI guidance...
✓ Step 1: navigate to /login (200ms)
✓ Step 2: type into email field (400ms)
✓ Step 3: type into password field (350ms)
✓ Step 4: click submit (200ms)
✓ Step 5: assert dashboard visible (150ms)

→ Persisting deterministic artifact → login.spec.vertz.json
```

**Subsequent runs (replay phase):**
```
$ vertz test login.spec.ts --replay

→ Loading deterministic artifact...
→ Fast-forward replay (no AI, pure automation)
✓ All steps passed (1.2s total)
```

The artifact is **the source of truth** after generation. Replay is 10-50x faster than AI execution.

## 3. What Debugging a Failure Looks Like

When a replay step fails:

```
✗ Step 3: click submit
  Expected: [data-testid="submit-btn"]
  Found:   element not found
  Screenshot: failures/3-click-submit.png
  
→ Self-healing triggered for broken step only...
→ AI Resolved: button moved to [data-testid="submit-new"]
→ Updated artifact

✓ Re-run: all steps passed
```

The dev sees: screenshot, expected vs actual, and the fix applied automatically.

## 4. The Persisted Deterministic Artifact

```json
{
  "version": "1.0",
  "intent": "User can login and see dashboard",
  "steps": [
    {
      "id": 1,
      "action": "navigate",
      "intent": "go to login page",
      "url": "/login",
      "resolved": { "url": "/login" }
    },
    {
      "id": 2,
      "action": "type",
      "intent": "enter email",
      "target": "emailInput",
      "resolved": { "selector": "[data-testid=\"email\"]", "strategy": "testId" }
    },
    {
      "id": 3,
      "action": "click",
      "intent": "submit form",
      "target": "submitButton", 
      "resolved": { "selector": "[data-testid=\"submit-btn\"]", "strategy": "testId" }
    }
  ],
  "generatedAt": "2026-02-19T12:00:00Z"
}
```

This JSON is **version-controllable**, human-readable, and replayable without AI.

## 5. Key DX Principles

| Principle | Cypress/Playwright | Natural Language | Vertz Type-Safe |
|-----------|-------------------|-------------------|-----------------|
| IDE autocomplete | ⚠️ Partial | ❌ None | ✅ Full |
| Type checking | ⚠️ Manual | ❌ None | ✅ Automatic |
| Refactor safety | ⚠️ Brittle | ❌ Fragile | ✅ Compile-time |
| Debugging | 📝 Logs | 📝 Ambiguous | 🎯 Screenshot + diff |
| Speed (replay) | ⚡ Fast | 🐢 Slow | ⚡⚡ Fastest |
| Self-healing | ❌ Manual | ✅ Auto | ✅ Auto + artifacts |

**The best of both worlds:** TypeScript's safety and IDE support, with AI doing the selector dirty work.

## 6. Risks and Tradeoffs

- **Learning curve:** Devs must learn intent-based actions, not selectors. Small overhead, huge payoff.
- **Identifier definition:** You still need to define `emailInput` somewhere. Currently requires a registry (could auto-generate).
- **AI dependency:** First run needs AI. If AI fails, no artifact. Mitigation: retries + fallback to Playwright selectors.
- **Artifact drift:** If the app changes significantly, the artifact becomes stale. Regular regeneration needed.

**Bottom line:** TypeScript gives you safety. Intent-based actions give you AI-resolved selectors. Artifacts give you fast replay. Natural language can't compete.
