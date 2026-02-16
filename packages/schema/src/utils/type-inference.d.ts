import type { SchemaAny } from '../core/schema';
/** Infer the output type of a schema. Alias for Output<T>. */
export type Infer<T extends SchemaAny> = T['_output'];
/** Infer the output type of a schema. */
export type Output<T extends SchemaAny> = T['_output'];
/** Infer the input type of a schema. Differs from Output when transforms exist. */
export type Input<T extends SchemaAny> = T['_input'];
//# sourceMappingURL=type-inference.d.ts.map
