import { describe, it } from '@vertz/test';
import type { InferColumnType } from '@vertz/db';
import { agentSessionColumns, agentMessageColumns } from '../columns';

// Type-flow for the jsonb opt-in (#2958). When `useJsonb: true` is passed with
// a TState / TToolCalls generic, the column's inferred row type must be T, not
// string — that is the whole point of the migration.

interface AgentState {
  readonly step: number;
  readonly notes: readonly string[];
}

describe('agentSessionColumns<TState>() — type flow', () => {
  it('default options: state column infers as string', () => {
    const cols = agentSessionColumns();
    type State = InferColumnType<typeof cols.state>;
    const _s: State = 'json-string';
    // @ts-expect-error — default is TEXT so typed objects are rejected at the type level
    const _bad: State = { step: 1 };
    void _s;
    void _bad;
  });

  it('with useJsonb + TState: state column infers as TState', () => {
    const cols = agentSessionColumns<AgentState>({ useJsonb: true });
    type State = InferColumnType<typeof cols.state>;
    const ok: State = { step: 1, notes: ['a'] };
    // @ts-expect-error — strings are no longer assignable once the generic is bound
    const bad: State = 'json-string';
    void ok;
    void bad;
  });
});

// Regression guard for dynamic-boolean call sites. Patterns like
//   const opts = { useJsonb: true };
//   agentSessionColumns(opts);
// widen away from the literal `true` and would otherwise miss the typed
// overloads. The fallback overload keeps the surface call-compatible.
declare const _flag: boolean;
// Session — dynamic boolean must compile.
const _dynSession = agentSessionColumns({ useJsonb: _flag });
_dynSession satisfies Record<string, unknown>;
// Message — dynamic boolean must compile.
const _dynMessage = agentMessageColumns({ useJsonb: _flag });
_dynMessage satisfies Record<string, unknown>;
// Natural widened-object pattern must also compile.
const _widenedOpts = { useJsonb: true };
const _dynSession2 = agentSessionColumns(_widenedOpts);
_dynSession2 satisfies Record<string, unknown>;

describe('agentMessageColumns<TToolCalls>() — type flow', () => {
  interface ToolCallLike {
    readonly name: string;
  }

  it('with useJsonb + TToolCalls: toolCalls column infers as T | null', () => {
    const cols = agentMessageColumns<readonly ToolCallLike[]>({ useJsonb: true });
    type Calls = InferColumnType<typeof cols.toolCalls>;
    const ok: Calls = [{ name: 'search' }];
    const asNull: Calls = null;
    // @ts-expect-error — a plain string is no longer assignable
    const bad: Calls = 'stringified';
    void ok;
    void asNull;
    void bad;
  });
});
