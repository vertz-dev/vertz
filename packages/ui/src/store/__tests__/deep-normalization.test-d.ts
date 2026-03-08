import {
  getRelationSchema,
  type RelationFieldDef,
  type RelationSchema,
  registerRelationSchema,
} from '../relation-registry';

// Schema types are correct
const schema: RelationSchema = {
  author: { type: 'one', entity: 'users' },
  tags: { type: 'many', entity: 'tags' },
};
registerRelationSchema('posts', schema);

const retrieved = getRelationSchema('posts');
// retrieved is RelationSchema | undefined
void (retrieved satisfies RelationSchema | undefined);

// @ts-expect-error — invalid relation type
const _bad: RelationFieldDef = { type: 'invalid', entity: 'users' };

// @ts-expect-error — missing entity field
const _bad2: RelationFieldDef = { type: 'one' };
