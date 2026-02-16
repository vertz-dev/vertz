import type { SchemaAny } from '@vertz/schema';
import type { ColumnMetadata } from '../schema/column';
/**
 * Maps a column's SQL type metadata to the corresponding @vertz/schema validator.
 *
 * @throws If the SQL type is not recognized.
 */
export declare function columnToSchema(meta: ColumnMetadata): SchemaAny;
//# sourceMappingURL=column-mapper.d.ts.map
