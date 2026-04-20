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

// String leaf exposes contains/startsWith/endsWith.
const pgPathStringContains: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.displayName).contains('Ac'),
};
void pgPathStringContains;

// ---------------------------------------------------------------------------
// path() — per-leaf operator narrowing (negatives)
// ---------------------------------------------------------------------------

// .contains() is not available on numeric leaves.
const pgPathNumContains: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.settings.count)
    // @ts-expect-error — contains is not available on number leaf
    .contains('1'),
};
void pgPathNumContains;

// .gt() is not available on string leaves (use eq / ne / in / contains).
const pgPathStringGt: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.settings.theme)
    // @ts-expect-error — gt is not available on string leaf
    .gt('dark'),
};
void pgPathStringGt;

// .startsWith() is not available on numeric leaves.
const pgPathNumStartsWith: FilterType<InstallColumns, 'postgres'> = {
  meta: path((m: InstallMeta) => m.settings.count)
    // @ts-expect-error — startsWith is not available on number leaf
    .startsWith('1'),
};
void pgPathNumStartsWith;

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

// ---------------------------------------------------------------------------
// Collision — hasKey on a payload whose natural keys collide with operator names
// ---------------------------------------------------------------------------
//
// When the user DOES write `{ hasKey: ... }` on the collision payload, the
// operand is restricted to `JsonbKeyOf<CollisionPayload>` = 'jsonContains' | 'hasKey'.
// Direct equality against the payload is covered by `pgCollisionDirect` above;
// this case confirms the operator-form still type-checks with a valid key.

const pgCollisionHasKey: FilterType<InstallColumns, 'postgres'> = {
  coll: { hasKey: 'jsonContains' },
};
void pgCollisionHasKey;

const pgCollisionHasKeyInvalid: FilterType<InstallColumns, 'postgres'> = {
  // @ts-expect-error — 'bogus' is not a key of CollisionPayload
  coll: { hasKey: 'bogus' },
};
void pgCollisionHasKeyInvalid;

// ---------------------------------------------------------------------------
// Inference-perf canary — 20 JSONB-heavy models typecheck under budget
// ---------------------------------------------------------------------------

interface CanaryMeta {
  a: string;
  b: { c: number };
}

const canaryFor = <TName extends string>(name: TName) =>
  d.table(name, {
    id: d.uuid().primary({ generate: 'cuid' }),
    title: d.text(),
    meta: d.jsonb<CanaryMeta>(),
  });

const canaryModels = {
  c01: d.model(canaryFor('c01')),
  c02: d.model(canaryFor('c02')),
  c03: d.model(canaryFor('c03')),
  c04: d.model(canaryFor('c04')),
  c05: d.model(canaryFor('c05')),
  c06: d.model(canaryFor('c06')),
  c07: d.model(canaryFor('c07')),
  c08: d.model(canaryFor('c08')),
  c09: d.model(canaryFor('c09')),
  c10: d.model(canaryFor('c10')),
  c11: d.model(canaryFor('c11')),
  c12: d.model(canaryFor('c12')),
  c13: d.model(canaryFor('c13')),
  c14: d.model(canaryFor('c14')),
  c15: d.model(canaryFor('c15')),
  c16: d.model(canaryFor('c16')),
  c17: d.model(canaryFor('c17')),
  c18: d.model(canaryFor('c18')),
  c19: d.model(canaryFor('c19')),
  c20: d.model(canaryFor('c20')),
};

const canaryDb = createDb({
  dialect: 'postgres',
  url: 'postgres://u:p@localhost/db',
  models: canaryModels,
  _queryFn: (async () => ({ rows: [], rowCount: 0 })) as never,
});

// Exercise the JSONB column-value branch across several delegate options —
// if threading blew up inference, tsgo compile time would balloon here.
void canaryDb.c01.list({ where: { meta: { jsonContains: { a: 'x' } } } });
void canaryDb.c10.list({ where: { meta: { hasKey: 'a' } } });
void canaryDb.c20.list({
  where: { meta: path((m: CanaryMeta) => m.b.c).gt(5) },
});
