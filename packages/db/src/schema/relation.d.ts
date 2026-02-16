import type { ColumnRecord, TableDef } from './table';
export interface ThroughDef<TJoin extends TableDef<ColumnRecord> = TableDef<ColumnRecord>> {
  readonly table: () => TJoin;
  readonly thisKey: string;
  readonly thatKey: string;
}
export interface RelationDef<
  TTarget extends TableDef<ColumnRecord> = TableDef<ColumnRecord>,
  TType extends 'one' | 'many' = 'one' | 'many',
> {
  readonly _type: TType;
  readonly _target: () => TTarget;
  readonly _foreignKey: string | null;
  readonly _through: ThroughDef | null;
}
export interface ManyRelationDef<TTarget extends TableDef<ColumnRecord> = TableDef<ColumnRecord>>
  extends RelationDef<TTarget, 'many'> {
  through<TJoin extends TableDef<ColumnRecord>>(
    joinTable: () => TJoin,
    thisKey: string,
    thatKey: string,
  ): RelationDef<TTarget, 'many'>;
}
export declare function createOneRelation<TTarget extends TableDef<ColumnRecord>>(
  target: () => TTarget,
  foreignKey: string,
): RelationDef<TTarget, 'one'>;
export declare function createManyRelation<TTarget extends TableDef<ColumnRecord>>(
  target: () => TTarget,
  foreignKey?: string,
): ManyRelationDef<TTarget>;
//# sourceMappingURL=relation.d.ts.map
