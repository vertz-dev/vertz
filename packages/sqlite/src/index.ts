// @vertz/sqlite — Type declarations and runtime stubs for the Vertz SQLite driver.
//
// Resolution order:
//   1. `vtz` runtime — the synthetic module loader intercepts this import
//      and provides the real SQLite implementation. This file is never reached.
//   2. Any other context — stubs that throw a helpful error.

const STUB_ERROR =
  '@vertz/sqlite: this module requires the vtz runtime. ' +
  'Run your app with `vtz dev` or `vtz run <script>` to use the built-in SQLite driver. ' +
  'For Node.js, use better-sqlite3 instead.';

function stub(): never {
  throw new Error(STUB_ERROR);
}

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------

/** Use `db.prepare()` to create statements. Exported for type annotations only. */
export class Statement<
  TRow = Record<string, unknown>,
  TParams extends unknown[] = unknown[],
> {
  all(..._params: TParams): TRow[] {
    return stub();
  }

  get(..._params: TParams): TRow | null {
    return stub();
  }

  run(..._params: TParams): { changes: number } {
    return stub();
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export class Database {
  constructor(_path: string) {
    stub();
  }

  exec(_sql: string): void {
    stub();
  }

  run(_sql: string, ..._params: unknown[]): { changes: number } {
    return stub();
  }

  prepare<TRow = Record<string, unknown>, TParams extends unknown[] = unknown[]>(
    _sql: string,
  ): Statement<TRow, TParams> {
    return stub();
  }

  /**
   * Wraps `fn` in BEGIN/COMMIT. If `fn` throws, issues ROLLBACK and re-throws.
   * Returns a callable that executes the transaction when invoked.
   *
   * Note: argument forwarding is not supported — the returned function takes
   * no arguments. This covers all current codebase usage. bun:sqlite's
   * `.deferred()`, `.immediate()`, `.exclusive()` modifiers are also omitted.
   */
  transaction<T>(_fn: () => T): () => T {
    return stub();
  }

  close(): void {
    stub();
  }
}

export default Database;
