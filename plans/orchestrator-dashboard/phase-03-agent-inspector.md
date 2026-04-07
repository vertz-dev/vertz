# Phase 3: Agent Inspector & Prompt Editor

## Context

This phase adds agent inspection pages and prompt editing. The prompt editor uses a textarea with live markdown preview — no rich-text editor dependency. Edits are stored in-memory only (not persisted to disk in v1).

This phase depends on Phase 1 only (not Phase 2). The agent inspector is accessible from the workflow detail page and via direct routes.

Design doc: `plans/orchestrator-dashboard.md`
Depends on: Phase 1

---

## Task 1: Add agent registry API endpoint

**Files:** (4)
- `sites/dev-orchestrator/src/api/services/agents.ts` (new)
- `sites/dev-orchestrator/src/api/services/agents.test.ts` (new)
- `sites/dev-orchestrator/src/api/server.ts` (modified — register new service)
- `sites/dev-orchestrator/src/orchestrator.ts` (modified — expose agent registry with mutable prompts)

**What to implement:**

```typescript
export function createAgentsService(orchestrator: Orchestrator) {
  return service('agents', {
    access: { list: rules.public, get: rules.public, updatePrompt: rules.public },
    actions: {
      list: {
        method: 'POST',
        response: s.object({ agents: s.array(agentSummarySchema) }),
        handler() { /* list all registered agents */ },
      },
      get: {
        method: 'POST',
        body: s.object({ name: s.string() }),
        response: agentDetailSchema.nullable(),
        handler(input) { /* return full agent detail with prompt, tools, config */ },
      },
      updatePrompt: {
        method: 'POST',
        body: s.object({ name: s.string(), prompt: s.string() }),
        response: s.object({ success: s.boolean() }),
        handler(input) { /* update in-memory prompt */ },
      },
    },
  });
}
```

The orchestrator needs a way to read and update agent prompts at runtime. Add a mutable prompt registry that wraps the static agent definitions — the original definitions stay frozen, but the registry can override the system prompt.

**Acceptance criteria:**
- [ ] `POST /api/agents/list` returns all registered agents with name, description, model
- [ ] `POST /api/agents/get` returns full agent detail including system prompt, tools, loop config
- [ ] `POST /api/agents/updatePrompt` updates the in-memory system prompt for an agent
- [ ] Updated prompts are used in subsequent workflow runs
- [ ] Original agent definitions are not mutated (registry wraps them)

---

## Task 2: Create PromptInspector and PromptEditor components

**Files:** (4)
- `sites/dev-orchestrator/src/ui/components/prompt-inspector.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/prompt-inspector.test.ts` (new)
- `sites/dev-orchestrator/src/ui/components/prompt-editor.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/prompt-editor.test.ts` (new)

**What to implement:**

`PromptInspector` — read-only markdown viewer:
```typescript
interface PromptInspectorProps {
  readonly value: string;
  readonly variables?: readonly string[];
}
```
- Renders system prompt as formatted markdown (via `marked`)
- Highlights template variables (`{{varName}}`) with a distinct style
- Scrollable container for long prompts

`PromptEditor` — extends inspector with editing:
```typescript
interface PromptEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly variables?: readonly string[];
}
```
- Side-by-side: textarea on left, live markdown preview on right
- Template variables highlighted in both textarea and preview
- Debounced `onChange` (300ms) to avoid excessive re-renders

**Acceptance criteria:**
- [ ] PromptInspector renders markdown with template variable highlighting
- [ ] PromptEditor shows textarea + live preview side-by-side
- [ ] Editing textarea updates preview in real time
- [ ] Template variables are visually distinct in both panes
- [ ] onChange fires with debounce on edit

---

## Task 3: Create agent detail and list pages

**Files:** (4)
- `sites/dev-orchestrator/src/ui/pages/agents-list.tsx` (new)
- `sites/dev-orchestrator/src/ui/pages/agent-detail.tsx` (new)
- `sites/dev-orchestrator/src/ui/pages/agent-detail.test.ts` (new)
- `sites/dev-orchestrator/src/ui/router.ts` (modified — add agent routes)

**What to implement:**

`/agents` — list page:
- Fetches agents via `POST /api/agents/list`
- Table/card grid: name, description, model, tool count
- Click to navigate to `/agents/:name`

`/agents/:name` — detail page:
- Fetches agent detail via `POST /api/agents/get`
- Shows: name, description, model info
- `PromptEditor` for the system prompt (with save button)
- Tools list with name and description
- Loop config display (maxIterations, tokenBudget)
- Save button calls `POST /api/agents/updatePrompt`

**Acceptance criteria:**
- [ ] `/agents` lists all registered agents
- [ ] `/agents/planner` shows full agent detail
- [ ] System prompt is editable in the PromptEditor
- [ ] Saving updates the in-memory prompt
- [ ] Tools list shows all agent tools
- [ ] Loop config (maxIterations, tokenBudget) is displayed
- [ ] "Saved" confirmation shown after successful update
