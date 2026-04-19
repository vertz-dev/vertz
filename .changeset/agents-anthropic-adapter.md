---
'@vertz/agents': patch
---

feat(agents): add Anthropic provider adapter

`@vertz/agents` now supports Anthropic's Claude models via the native Messages
API. Use `{ provider: 'anthropic', model: 'claude-sonnet-4-6' }` in your agent
config and set `ANTHROPIC_API_KEY` in the environment.

```ts
const triage = agent({
  model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  // ...
});
```

The adapter speaks the native Messages API (not the OpenAI-compatible shim),
so tool calls flow through `tool_use` / `tool_result` content blocks and
token usage is reported via `TokenUsageSummary`.

Closes #2834.
