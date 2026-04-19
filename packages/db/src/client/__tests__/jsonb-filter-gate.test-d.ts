/**
 * Type-level tests for the dialect-conditional `FilterType` gate introduced
 * in Phase B of jsonb-sqlite-parity (#2850).
 *
 * These tests use `@ts-expect-error` to assert negative shapes compile to
 * errors on SQLite and positive shapes compile on Postgres.
 */

import { d } from '../../d';
import type { FilterType } from '../../schema/inference';

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'cuid' }),
  meta: d.jsonb<{ displayName: string }>(),
});

type InstallColumns = (typeof installTable)['_columns'];

// ---------------------------------------------------------------------------
// Postgres (positive): path-shaped JSONB keys compile.
// ---------------------------------------------------------------------------

const pgPathFilter: FilterType<InstallColumns, 'postgres'> = {
  'meta->displayName': { eq: 'Acme' },
};
void pgPathFilter;

const pgColumnFilter: FilterType<InstallColumns, 'postgres'> = {
  meta: { eq: { displayName: 'Acme' } },
};
void pgColumnFilter;

// ---------------------------------------------------------------------------
// SQLite (negative): path-shaped keys on a JSONB column must not compile.
// ---------------------------------------------------------------------------

const sqliteBadPath: FilterType<InstallColumns, 'sqlite'> = {
  // @ts-expect-error — JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS
  'meta->displayName': { eq: 'Acme' },
};
void sqliteBadPath;

// ---------------------------------------------------------------------------
// SQLite (positive): direct column equality filter still works.
// ---------------------------------------------------------------------------

const sqliteOkColumn: FilterType<InstallColumns, 'sqlite'> = {
  meta: { eq: { displayName: 'Acme' } },
};
void sqliteOkColumn;

// ---------------------------------------------------------------------------
// createDb inference — narrow TDialect from the literal `dialect` option.
// ---------------------------------------------------------------------------

import { createDb } from '../database';

const sqliteDb = createDb({
  dialect: 'sqlite',
  path: ':memory:',
  models: { install: d.model(installTable) },
  migrations: { autoApply: true },
});

// Path filter via createDb('sqlite') — must not compile.
void sqliteDb.install.list({
  where: {
    // @ts-expect-error — JsonbPathFilter_Error_Requires_Dialect_Postgres_…
    'meta->displayName': { eq: 'Acme' },
  },
});

// Plain column filter on the jsonb column — must compile on sqlite.
void sqliteDb.install.list({
  where: { meta: { eq: { displayName: 'Acme' } } },
});

// Postgres narrows via the literal; path keys compile.
const pgDb = createDb({
  dialect: 'postgres',
  url: 'postgres://u:p@localhost/db',
  models: { install: d.model(installTable) },
  _queryFn: (async () => ({ rows: [], rowCount: 0 })) as never,
});

void pgDb.install.list({
  where: { 'meta->displayName': { eq: 'Acme' } },
});

// ---------------------------------------------------------------------------
// Nested include — path key gating propagates through include.where on SQLite.
// ---------------------------------------------------------------------------

const orgTable = d.table('org', {
  id: d.uuid().primary({ generate: 'cuid' }),
  name: d.text(),
});

const tenantTable = d.table('tenant', {
  id: d.uuid().primary({ generate: 'cuid' }),
  orgId: d.uuid(),
  meta: d.jsonb<{ displayName: string }>(),
});

const orgModel = d.model(orgTable, {
  tenants: d.ref.many(() => tenantTable, 'orgId'),
});
const tenantModel = d.model(tenantTable);

const nestedDb = createDb({
  dialect: 'sqlite',
  path: ':memory:',
  models: { org: orgModel, tenant: tenantModel },
  migrations: { autoApply: true },
});

void nestedDb.org.list({
  include: {
    tenants: {
      where: {
        // @ts-expect-error — nested include path filter is still gated
        'meta->displayName': { eq: 'Acme' },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Inference-perf canary — 20 models × 5 columns each, must typecheck.
// Regresses loudly if the generic threading explodes TS compile time.
// ---------------------------------------------------------------------------

const modelFor = <TName extends string>(name: TName) =>
  d.table(name, {
    id: d.uuid().primary({ generate: 'cuid' }),
    tenantId: d.uuid(),
    title: d.text(),
    meta: d.jsonb<{ k: string }>(),
    createdAt: d.timestamp().default('now').readOnly(),
  });

const bigModels = {
  m01: d.model(modelFor('m01')),
  m02: d.model(modelFor('m02')),
  m03: d.model(modelFor('m03')),
  m04: d.model(modelFor('m04')),
  m05: d.model(modelFor('m05')),
  m06: d.model(modelFor('m06')),
  m07: d.model(modelFor('m07')),
  m08: d.model(modelFor('m08')),
  m09: d.model(modelFor('m09')),
  m10: d.model(modelFor('m10')),
  m11: d.model(modelFor('m11')),
  m12: d.model(modelFor('m12')),
  m13: d.model(modelFor('m13')),
  m14: d.model(modelFor('m14')),
  m15: d.model(modelFor('m15')),
  m16: d.model(modelFor('m16')),
  m17: d.model(modelFor('m17')),
  m18: d.model(modelFor('m18')),
  m19: d.model(modelFor('m19')),
  m20: d.model(modelFor('m20')),
};

const bigDb = createDb({
  dialect: 'sqlite',
  path: ':memory:',
  models: bigModels,
  migrations: { autoApply: true },
});

// Just instantiate delegate option types — if threading blew up inference,
// tsgo compile time would balloon or fail here.
void bigDb.m01.list({ where: { title: 'x' } });
void bigDb.m20.list({ where: { title: 'y' } });

// ---------------------------------------------------------------------------
// Gate also fires through aggregate() — TDialect threads into
// TypedAggregateArgs so `where` on an aggregate call is gated the same way
// as `where` on a list() call.
// ---------------------------------------------------------------------------

void sqliteDb.install.aggregate({
  _count: true,
  where: {
    // @ts-expect-error — JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS
    'meta->displayName': { eq: 'Acme' },
  },
});

void pgDb.install.aggregate({
  _count: true,
  where: { 'meta->displayName': { eq: 'Acme' } },
});
