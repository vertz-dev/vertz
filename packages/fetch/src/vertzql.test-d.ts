/**
 * Type-level tests for VertzQL types.
 *
 * Validates that VertzQLParams is assignable to Record<string, unknown>,
 * which is the parameter type of resolveVertzQL(). Generated entity SDK
 * code passes VertzQLParams to resolveVertzQL — this must not produce
 * a TS2345 error (#2561).
 *
 * Checked by `tsc --noEmit -p tsconfig.typecheck.json`.
 */

import type { VertzQLParams } from './vertzql';
import { resolveVertzQL } from './vertzql';

// ─── VertzQLParams is passable to resolveVertzQL ─────────────────

declare const params: VertzQLParams;
resolveVertzQL(params);

// ─── VertzQLParams is assignable to Record<string, unknown> ──────

const _record: Record<string, unknown> = params;
void _record;

// ─── Optional VertzQLParams works (the generated code pattern) ───

declare const optionalParams: VertzQLParams | undefined;
resolveVertzQL(optionalParams);
