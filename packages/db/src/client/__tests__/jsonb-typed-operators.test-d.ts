/**
 * Type-level tests for typed JSONB operators (#2868):
 * - Payload operators: `jsonContains`, `jsonContainedBy`, `hasKey`.
 * - Typed `path()` builder with leaf-type-driven operator availability.
 * - Dialect gating via the `JsonbOperator_Error_…` brand on SQLite.
 *
 * Negatives use `@ts-expect-error` — if the directive becomes unused, the
 * test fails, catching regressions that loosen the type surface.
 */

import { d } from '../../d';
import { path } from '../../path';
import type { FilterType } from '../../schema/inference';
import { createDb } from '../database';

interface InstallMeta {
  displayName: string;
  settings: { theme: 'light' | 'dark'; count: number };
  tags: readonly string[];
  capacity: number | null;
  createdAt: Date;
}

type UnionPayload = { a: 1; x: string } | { b: 2; x: number };
type PrimitivePayload = string;
// Backcompat collision: natural keys collide with operator names.
interface CollisionPayload {
  jsonContains: string;
  hasKey: boolean;
}

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'cuid' }),
  meta: d.jsonb<InstallMeta>(),
  union: d.jsonb<UnionPayload>(),
  prim: d.jsonb<PrimitivePayload>(),
  coll: d.jsonb<CollisionPayload>(),
});

type InstallColumns = (typeof installTable)['_columns'];

// ---------------------------------------------------------------------------
// Payload operators — Postgres positives
// ---------------------------------------------------------------------------

const pgJsonContains: FilterType<InstallColumns, 'postgres'> = {
  meta: { jsonContains: { settings: { theme: 'dark' } } },
};
void pgJsonContains;

const pgJsonContainedBy: FilterType<InstallColumns, 'postgres'> = {
  meta: { jsonContainedBy: { displayName: 'Acme', settings: { theme: 'dark', count: 2 } } },
};
void pgJsonContainedBy;

const pgHasKey: FilterType<InstallColumns, 'postgres'> = {
  meta: { hasKey: 'displayName' },
};
void pgHasKey;

// Union payload — distributive conditional yields union of all variants' keys.
const pgUnionHasKeyA: FilterType<InstallColumns, 'postgres'> = {
  union: { hasKey: 'a' },
};
void pgUnionHasKeyA;

const pgUnionHasKeyX: FilterType<InstallColumns, 'postgres'> = {
  union: { hasKey: 'x' },
};
void pgUnionHasKeyX;

// ---------------------------------------------------------------------------
// Payload operators — negatives
// ---------------------------------------------------------------------------

// Unknown key rejected.
const pgHasKeyUnknown: FilterType<InstallColumns, 'postgres'> = {
  meta: {
    // @ts-expect-error — 'bogus' is not keyof InstallMeta
    hasKey: 'bogus',
  },
};
void pgHasKeyUnknown;

// DeepPartial shape mismatch — wrong literal on a string-literal union leaf.
const pgJsonContainsBad: FilterType<InstallColumns, 'postgres'> = {
  meta: {
    jsonContains: {
      settings: {
        // @ts-expect-error — 'foggy' is not 'light' | 'dark'
        theme: 'foggy',
      },
    },
  },
};
void pgJsonContainsBad;

// Non-object JSONB payload — hasKey resolves to `never`, any operand rejected.
const pgHasKeyOnPrimitive: FilterType<InstallColumns, 'postgres'> = {
  prim: {
    // @ts-expect-error — hasKey unavailable on primitive JSONB payloads (JsonbKeyOf<string> = never)
    hasKey: 'anything',
  },
};
void pgHasKeyOnPrimitive;

// ---------------------------------------------------------------------------
// Payload operators — SQLite negatives (brand diagnostic)
// ---------------------------------------------------------------------------

const sqliteJsonContains: FilterType<InstallColumns, 'sqlite'> = {
  meta: {
    // @ts-expect-error — JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
    jsonContains: { displayName: 'Acme' },
  },
};
void sqliteJsonContains;

const sqliteHasKey: FilterType<InstallColumns, 'sqlite'> = {
  meta: {
    // @ts-expect-error — JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
    hasKey: 'displayName',
  },
};
void sqliteHasKey;

// ---------------------------------------------------------------------------
// path() builder — leaf-type flow
// ---------------------------------------------------------------------------

const pgPathStringEq: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.settings.theme).eq('dark'),
};
void pgPathStringEq;

const pgPathNumericGt: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.settings.count).gt(5),
};
void pgPathNumericGt;

const pgPathNullableIsNull: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.capacity).isNull(true),
};
void pgPathNullableIsNull;

const pgPathArrayIndex: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.tags[0]).eq('urgent'),
};
void pgPathArrayIndex;

// Path descriptor assignable on a path-shaped string key too (cross-form
// doesn't apply — descriptors go into the column slot, not the 'col->k' slot).

// ---------------------------------------------------------------------------
// path() builder — SQLite (descriptor slot is gated via JsonbColumnValue)
// ---------------------------------------------------------------------------

const sqlitePath: FilterType<InstallColumns, 'sqlite'> = {
  // @ts-expect-error — JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
  meta: path((m: InstallMeta) => m.settings.theme).eq('dark'),
};
void sqlitePath;

// ---------------------------------------------------------------------------
// Backcompat: payloads whose natural keys collide with operator names
// ---------------------------------------------------------------------------

// Direct payload equality still accepted — the whole literal is a T, not ops.
const pgCollisionDirect: FilterType<InstallColumns, 'postgres'> = {
  coll: { jsonContains: 'literal', hasKey: true },
};
void pgCollisionDirect;

// ---------------------------------------------------------------------------
// createDb end-to-end inference
// ---------------------------------------------------------------------------

const sqliteDb = createDb({
  dialect: 'sqlite',
  path: ':memory:',
  models: { install: d.model(installTable) },
  migrations: { autoApply: true },
});

void sqliteDb.install.list({
  where: {
    // @ts-expect-error — JsonbOperator_Error_Requires_Dialect_Postgres_…
    meta: { jsonContains: { displayName: 'Acme' } },
  },
});

// Direct equality still works on SQLite.
void sqliteDb.install.list({
  where: {
    meta: {
      eq: {
        displayName: 'Acme',
        settings: { theme: 'dark', count: 1 },
        tags: [],
        capacity: null,
        createdAt: new Date(),
      },
    },
  },
});

const pgDb = createDb({
  dialect: 'postgres',
  url: 'postgres://u:p@localhost/db',
  models: { install: d.model(installTable) },
  _queryFn: (async () => ({ rows: [], rowCount: 0 })) as never,
});

void pgDb.install.list({
  where: {
    meta: { jsonContains: { settings: { theme: 'dark' } } },
  },
});

void pgDb.install.list({
  where: {
    meta: path((m: InstallMeta) => m.settings.theme).eq('dark'),
  },
});

void pgDb.install.list({
  where: {
    meta: { hasKey: 'settings' },
  },
});
