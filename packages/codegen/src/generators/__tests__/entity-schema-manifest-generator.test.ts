import { describe, expect, it } from 'bun:test';
import type { CodegenEntityModule, CodegenIR, GeneratorConfig } from '../../types';
import { EntitySchemaManifestGenerator } from '../entity-schema-manifest-generator';

function makeIR(entities: CodegenEntityModule[]): CodegenIR {
  return {
    basePath: '/',
    modules: [],
    schemas: [],
    entities,
    auth: { schemes: [] },
  };
}

const generatorConfig: GeneratorConfig = {
  outputDir: '.vertz/generated',
  options: {},
};

describe('EntitySchemaManifestGenerator', () => {
  it('has name "entity-schema-manifest"', () => {
    const gen = new EntitySchemaManifestGenerator();
    expect(gen.name).toBe('entity-schema-manifest');
  });

  it('generates entity-schema.json with correct structure', () => {
    const ir = makeIR([
      {
        entityName: 'tasks',
        operations: [],
        actions: [],
        relations: [{ name: 'assignee', type: 'one', entity: 'users' }],
        tenantScoped: true,
        table: 'tasks',
        primaryKey: 'id',
        hiddenFields: [],
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'title', tsType: 'string', optional: false },
          { name: 'status', tsType: 'string', optional: false },
        ],
        relationSelections: {
          assignee: 'all',
        },
      },
    ]);

    const gen = new EntitySchemaManifestGenerator();
    const files = gen.generate(ir, generatorConfig);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('entity-schema.json');

    const manifest = JSON.parse(files[0].content);
    expect(manifest.tasks).toBeDefined();
    expect(manifest.tasks.table).toBe('tasks');
    expect(manifest.tasks.primaryKey).toBe('id');
    expect(manifest.tasks.tenantScoped).toBe(true);
    expect(manifest.tasks.hiddenFields).toEqual([]);
    expect(manifest.tasks.fields).toEqual(['id', 'title', 'status']);
    expect(manifest.tasks.relations).toEqual({
      assignee: {
        type: 'one',
        entity: 'users',
        selection: 'all',
        allowWhere: [],
        allowOrderBy: [],
      },
    });
  });

  it('generates entity with field-level relation selection', () => {
    const ir = makeIR([
      {
        entityName: 'tasks',
        operations: [],
        actions: [],
        relations: [{ name: 'assignee', type: 'one', entity: 'users' }],
        tenantScoped: false,
        primaryKey: 'id',
        hiddenFields: ['secretKey'],
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'title', tsType: 'string', optional: false },
        ],
        relationSelections: {
          assignee: ['name', 'email'],
        },
      },
    ]);

    const gen = new EntitySchemaManifestGenerator();
    const files = gen.generate(ir, generatorConfig);
    const manifest = JSON.parse(files[0].content);

    expect(manifest.tasks.hiddenFields).toEqual(['secretKey']);
    expect(manifest.tasks.tenantScoped).toBe(false);
    expect(manifest.tasks.relations.assignee.selection).toEqual(['name', 'email']);
  });

  it('handles entities with no relations', () => {
    const ir = makeIR([
      {
        entityName: 'settings',
        operations: [],
        actions: [],
        tenantScoped: false,
        primaryKey: 'id',
        hiddenFields: [],
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'key', tsType: 'string', optional: false },
          { name: 'value', tsType: 'string', optional: false },
        ],
      },
    ]);

    const gen = new EntitySchemaManifestGenerator();
    const files = gen.generate(ir, generatorConfig);
    const manifest = JSON.parse(files[0].content);

    expect(manifest.settings.relations).toEqual({});
    expect(manifest.settings.fields).toEqual(['id', 'key', 'value']);
  });

  it('generates multiple entities in a single manifest', () => {
    const ir = makeIR([
      {
        entityName: 'users',
        operations: [],
        actions: [],
        relations: [{ name: 'posts', type: 'many', entity: 'posts' }],
        tenantScoped: true,
        primaryKey: 'id',
        hiddenFields: ['passwordHash'],
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'name', tsType: 'string', optional: false },
          { name: 'email', tsType: 'string', optional: false },
        ],
        relationSelections: {
          posts: 'all',
        },
      },
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [{ name: 'author', type: 'one', entity: 'users' }],
        tenantScoped: true,
        primaryKey: 'id',
        hiddenFields: [],
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'title', tsType: 'string', optional: false },
          { name: 'content', tsType: 'string', optional: false },
        ],
        relationSelections: {
          author: 'all',
        },
      },
    ]);

    const gen = new EntitySchemaManifestGenerator();
    const files = gen.generate(ir, generatorConfig);
    const manifest = JSON.parse(files[0].content);

    expect(Object.keys(manifest)).toEqual(['users', 'posts']);
    expect(manifest.users.relations.posts.type).toBe('many');
    expect(manifest.posts.relations.author.type).toBe('one');
  });

  it('omits optional fields that are not provided', () => {
    const ir = makeIR([
      {
        entityName: 'logs',
        operations: [],
        actions: [],
      },
    ]);

    const gen = new EntitySchemaManifestGenerator();
    const files = gen.generate(ir, generatorConfig);
    const manifest = JSON.parse(files[0].content);

    expect(manifest.logs.fields).toEqual([]);
    expect(manifest.logs.relations).toEqual({});
    expect(manifest.logs.hiddenFields).toEqual([]);
    expect(manifest.logs.tenantScoped).toBe(false);
  });

  it('includes allowWhere, allowOrderBy, maxLimit in relation metadata (#1130)', () => {
    const ir = makeIR([
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [
          { name: 'comments', type: 'many', entity: 'comments' },
          { name: 'author', type: 'one', entity: 'users' },
        ],
        tenantScoped: false,
        primaryKey: 'id',
        hiddenFields: [],
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'title', tsType: 'string', optional: false },
        ],
        relationSelections: {
          comments: ['text', 'status', 'createdAt'],
          author: ['name', 'email'],
        },
        relationQueryConfig: {
          comments: {
            allowWhere: ['status', 'createdAt'],
            allowOrderBy: ['createdAt'],
            maxLimit: 50,
          },
        },
      },
    ]);

    const gen = new EntitySchemaManifestGenerator();
    const files = gen.generate(ir, generatorConfig);
    const manifest = JSON.parse(files[0].content);

    expect(manifest.posts.relations.comments.allowWhere).toEqual(['status', 'createdAt']);
    expect(manifest.posts.relations.comments.allowOrderBy).toEqual(['createdAt']);
    expect(manifest.posts.relations.comments.maxLimit).toBe(50);
    // author has no query config — defaults to empty arrays and no maxLimit
    expect(manifest.posts.relations.author.allowWhere).toEqual([]);
    expect(manifest.posts.relations.author.allowOrderBy).toEqual([]);
    expect(manifest.posts.relations.author.maxLimit).toBeUndefined();
  });

  it('returns empty manifest when no entities exist', () => {
    const ir = makeIR([]);

    const gen = new EntitySchemaManifestGenerator();
    const files = gen.generate(ir, generatorConfig);
    const manifest = JSON.parse(files[0].content);

    expect(manifest).toEqual({});
  });
});
