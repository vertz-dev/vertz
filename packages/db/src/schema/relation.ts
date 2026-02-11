import type { ColumnRecord, TableDef } from './table';

// ---------------------------------------------------------------------------
// Through (join table) metadata
// ---------------------------------------------------------------------------

export interface ThroughDef<TJoin extends TableDef<ColumnRecord> = TableDef<ColumnRecord>> {
  readonly table: () => TJoin;
  readonly thisKey: string;
  readonly thatKey: string;
}

// ---------------------------------------------------------------------------
// RelationDef interface
// ---------------------------------------------------------------------------

export interface RelationDef<
  TTarget extends TableDef<ColumnRecord> = TableDef<ColumnRecord>,
  TType extends 'one' | 'many' = 'one' | 'many',
> {
  readonly _type: TType;
  readonly _target: () => TTarget;
  readonly _foreignKey: string | null;
  readonly _through: ThroughDef | null;
}

// ---------------------------------------------------------------------------
// ManyRelationDef -- intermediate type that exposes .through()
// ---------------------------------------------------------------------------

export interface ManyRelationDef<TTarget extends TableDef<ColumnRecord> = TableDef<ColumnRecord>>
  extends RelationDef<TTarget, 'many'> {
  through<TJoin extends TableDef<ColumnRecord>>(
    joinTable: () => TJoin,
    thisKey: string,
    thatKey: string,
  ): RelationDef<TTarget, 'many'>;
}

// ---------------------------------------------------------------------------
// Factory: createOneRelation
// ---------------------------------------------------------------------------

export function createOneRelation<TTarget extends TableDef<ColumnRecord>>(
  target: () => TTarget,
  foreignKey: string,
): RelationDef<TTarget, 'one'> {
  return {
    _type: 'one',
    _target: target,
    _foreignKey: foreignKey,
    _through: null,
  };
}

// ---------------------------------------------------------------------------
// Factory: createManyRelation
// ---------------------------------------------------------------------------

export function createManyRelation<TTarget extends TableDef<ColumnRecord>>(
  target: () => TTarget,
  foreignKey?: string,
): ManyRelationDef<TTarget> {
  return {
    _type: 'many',
    _target: target,
    _foreignKey: foreignKey ?? null,
    _through: null,
    through<TJoin extends TableDef<ColumnRecord>>(
      joinTable: () => TJoin,
      thisKey: string,
      thatKey: string,
    ): RelationDef<TTarget, 'many'> {
      return {
        _type: 'many',
        _target: target,
        _foreignKey: null,
        _through: {
          table: joinTable,
          thisKey,
          thatKey,
        },
      };
    },
  };
}
