/**
 * @vertz/db codegen
 *
 * Generates typed database client code from domain definitions.
 */

export { generateClient } from './client-gen';
export {
  type DomainDefinition,
  type DomainField,
  type DomainRelation,
  generateTypes,
} from './type-gen';
