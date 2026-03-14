import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { rules } from '../../auth/rules';
import { entity } from '../entity';
import {
  columnToJsonSchema,
  type EntitySchemaObject,
  entityCreateInputSchema,
  entityResponseSchema,
  entityUpdateInputSchema,
  generateOpenAPISpec,
} from '../openapi-generator';

// ---------------------------------------------------------------------------
// Phase 1: Column type → JSON Schema mapping
// ---------------------------------------------------------------------------

describe('Feature: Column to JSON Schema mapping', () => {
  describe('Given a column with sqlType "uuid"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "uuid" }', () => {
        const col = d.uuid();
        expect(columnToJsonSchema(col)).toEqual({ type: 'string', format: 'uuid' });
      });
    });
  });

  describe('Given a column with sqlType "text"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string" }', () => {
        const col = d.text();
        expect(columnToJsonSchema(col)).toEqual({ type: 'string' });
      });
    });
  });

  describe('Given a column with sqlType "integer"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "integer" }', () => {
        const col = d.integer();
        expect(columnToJsonSchema(col)).toEqual({ type: 'integer' });
      });
    });
  });

  describe('Given a column with sqlType "boolean"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "boolean" }', () => {
        const col = d.boolean();
        expect(columnToJsonSchema(col)).toEqual({ type: 'boolean' });
      });
    });
  });

  describe('Given a column with format "email"', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "email" }', () => {
        const col = d.email();
        expect(columnToJsonSchema(col)).toEqual({ type: 'string', format: 'email' });
      });
    });
  });

  describe('Given a varchar(255) column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", maxLength: 255 }', () => {
        const col = d.varchar(255);
        expect(columnToJsonSchema(col)).toEqual({ type: 'string', maxLength: 255 });
      });
    });
  });

  describe('Given a timestamp column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "date-time" }', () => {
        const col = d.timestamp();
        expect(columnToJsonSchema(col)).toEqual({ type: 'string', format: 'date-time' });
      });
    });
  });

  describe('Given a date column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "date" }', () => {
        const col = d.date();
        expect(columnToJsonSchema(col)).toEqual({ type: 'string', format: 'date' });
      });
    });
  });

  describe('Given a time column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", format: "time" }', () => {
        const col = d.time();
        expect(columnToJsonSchema(col)).toEqual({ type: 'string', format: 'time' });
      });
    });
  });

  describe('Given a bigint column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string" } (JSON cannot represent BigInt)', () => {
        const col = d.bigint();
        expect(columnToJsonSchema(col)).toEqual({ type: 'string' });
      });
    });
  });

  describe('Given a decimal column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string" } (arbitrary precision)', () => {
        const col = d.decimal(10, 2);
        expect(columnToJsonSchema(col)).toEqual({ type: 'string' });
      });
    });
  });

  describe('Given a real column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "number" }', () => {
        const col = d.real();
        expect(columnToJsonSchema(col)).toEqual({ type: 'number' });
      });
    });
  });

  describe('Given a doublePrecision column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "number", format: "double" }', () => {
        const col = d.doublePrecision();
        expect(columnToJsonSchema(col)).toEqual({ type: 'number', format: 'double' });
      });
    });
  });

  describe('Given a serial column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "integer" }', () => {
        const col = d.serial();
        expect(columnToJsonSchema(col)).toEqual({ type: 'integer' });
      });
    });
  });

  describe('Given an enum column with values ["draft", "published"]', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "string", enum: ["draft", "published"] }', () => {
        const col = d.enum('status', ['draft', 'published']);
        expect(columnToJsonSchema(col)).toEqual({
          type: 'string',
          enum: ['draft', 'published'],
        });
      });
    });
  });

  describe('Given a text array column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "array", items: { type: "string" } }', () => {
        const col = d.textArray();
        expect(columnToJsonSchema(col)).toEqual({
          type: 'array',
          items: { type: 'string' },
        });
      });
    });
  });

  describe('Given an integer array column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns { type: "array", items: { type: "integer" } }', () => {
        const col = d.integerArray();
        expect(columnToJsonSchema(col)).toEqual({
          type: 'array',
          items: { type: 'integer' },
        });
      });
    });
  });

  describe('Given a jsonb column without validator', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns {} (any)', () => {
        const col = d.jsonb();
        expect(columnToJsonSchema(col)).toEqual({});
      });
    });
  });

  describe('Given a nullable column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns type as array including "null"', () => {
        const col = d.text().nullable();
        expect(columnToJsonSchema(col)).toEqual({ type: ['string', 'null'] });
      });
    });
  });

  describe('Given a nullable integer column', () => {
    describe('When columnToJsonSchema is called', () => {
      it('Then returns type as array including "null"', () => {
        const col = d.integer().nullable();
        expect(columnToJsonSchema(col)).toEqual({ type: ['integer', 'null'] });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  description: d.text().nullable(),
  status: d.enum('task_status', ['todo', 'in_progress', 'done']).default('todo'),
  estimate: d.integer().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
  passwordHash: d.text().is('hidden'),
});

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email(),
});

const commentsTable = d.table('comments', {
  id: d.uuid().primary(),
  text: d.text(),
  taskId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const tasksModel = d.model(tasksTable, {
  assignee: d.ref.one(() => usersTable, 'assigneeId'),
  comments: d.ref.many(() => commentsTable, 'taskId'),
});

// ---------------------------------------------------------------------------
// Phase 1: Entity response schema generation
// ---------------------------------------------------------------------------

describe('Feature: Entity response schema generation', () => {
  describe('Given an entity with expose.select listing specific fields', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then schema properties contain only exposed fields', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: { id: true, title: true, status: true },
          },
        });

        const schema = entityResponseSchema(def);

        expect(Object.keys(schema.properties!)).toEqual(
          expect.arrayContaining(['id', 'title', 'status']),
        );
        expect(Object.keys(schema.properties!)).toHaveLength(3);
      });

      it('Then hidden columns are excluded', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: { id: true, title: true },
          },
        });

        const schema = entityResponseSchema(def);

        expect(schema.properties!['passwordHash']).toBeUndefined();
      });
    });
  });

  describe('Given an entity without expose config', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then schema properties contain all public (non-hidden) columns', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
        });

        const schema = entityResponseSchema(def);

        // All non-hidden columns
        expect(schema.properties!['id']).toBeDefined();
        expect(schema.properties!['title']).toBeDefined();
        expect(schema.properties!['description']).toBeDefined();
        expect(schema.properties!['status']).toBeDefined();
        expect(schema.properties!['estimate']).toBeDefined();
        expect(schema.properties!['createdAt']).toBeDefined();
        expect(schema.properties!['updatedAt']).toBeDefined();
        // Hidden column excluded
        expect(schema.properties!['passwordHash']).toBeUndefined();
      });
    });
  });

  describe('Given a descriptor-guarded field (AccessRule in select)', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then the field type includes null', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: {
              id: true,
              title: true,
              estimate: rules.entitlement('pm:view-estimates'),
            },
          },
        });

        const schema = entityResponseSchema(def);

        expect(schema.properties!['estimate'].type).toEqual(['integer', 'null']);
      });

      it('Then the field has a description mentioning the entitlement', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: {
              id: true,
              estimate: rules.entitlement('pm:view-estimates'),
            },
          },
        });

        const schema = entityResponseSchema(def);

        expect(schema.properties!['estimate'].description).toContain('pm:view-estimates');
      });

      it('Then the field is not in required array', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: {
              id: true,
              title: true,
              estimate: rules.entitlement('pm:view-estimates'),
            },
          },
        });

        const schema = entityResponseSchema(def);

        expect(schema.required).toContain('id');
        expect(schema.required).toContain('title');
        expect(schema.required).not.toContain('estimate');
      });
    });
  });

  describe('Given required vs optional fields', () => {
    describe('When entityResponseSchema is called', () => {
      it('Then non-nullable, non-guarded fields are required', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: { id: true, title: true, description: true },
          },
        });

        const schema = entityResponseSchema(def);

        expect(schema.required).toContain('id');
        expect(schema.required).toContain('title');
        // nullable fields are not required
        expect(schema.required).not.toContain('description');
      });
    });
  });

  describe('Given a relation with include: true shorthand', () => {
    describe('When entityResponseSchema is called with collectRelationSchemas', () => {
      it('Then resolves target table and includes all public columns', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: { id: true, title: true },
            include: {
              assignee: true,
            },
          },
        });

        const schemas: Record<string, EntitySchemaObject> = {};
        entityResponseSchema(def, schemas);

        const assigneeSchema = schemas['TasksAssigneeResponse'];
        expect(assigneeSchema).toBeDefined();
        expect(assigneeSchema.properties!['id']).toBeDefined();
        expect(assigneeSchema.properties!['name']).toBeDefined();
        expect(assigneeSchema.properties!['email']).toBeDefined();
      });
    });
  });

  describe('Given a relation with structured RelationExposeConfig', () => {
    describe('When entityResponseSchema is called with collectRelationSchemas', () => {
      it('Then only includes fields listed in relation select', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: { list: rules.authenticated() },
          expose: {
            select: { id: true, title: true },
            include: {
              comments: {
                select: { id: true, text: true },
              },
            },
          },
        });

        const schemas: Record<string, EntitySchemaObject> = {};
        entityResponseSchema(def, schemas);

        const commentSchema = schemas['TasksCommentsResponse'];
        expect(commentSchema).toBeDefined();
        expect(Object.keys(commentSchema.properties!)).toHaveLength(2);
        expect(commentSchema.properties!['id']).toBeDefined();
        expect(commentSchema.properties!['text']).toBeDefined();
        expect(commentSchema.properties!['createdAt']).toBeUndefined();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Input schemas
// ---------------------------------------------------------------------------

describe('Feature: Create input schema', () => {
  describe('Given an entity with PK, readOnly, hidden, and writable columns', () => {
    describe('When entityCreateInputSchema is called', () => {
      it('Then PK column is excluded', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityCreateInputSchema(def);
        expect(schema.properties!['id']).toBeUndefined();
      });

      it('Then readOnly columns are excluded', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityCreateInputSchema(def);
        expect(schema.properties!['createdAt']).toBeUndefined();
      });

      it('Then autoUpdate (readOnly) columns are excluded', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityCreateInputSchema(def);
        expect(schema.properties!['updatedAt']).toBeUndefined();
      });

      it('Then hidden columns are excluded', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityCreateInputSchema(def);
        expect(schema.properties!['passwordHash']).toBeUndefined();
      });

      it('Then columns with defaults are not required', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityCreateInputSchema(def);
        expect(schema.required).not.toContain('status');
      });

      it('Then columns without defaults are required', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityCreateInputSchema(def);
        expect(schema.required).toContain('title');
      });

      it('Then writable columns NOT in expose.select are still included', () => {
        const def = entity('tasks', {
          model: tasksModel,
          access: {},
          expose: {
            select: { id: true, title: true },
          },
        });
        const schema = entityCreateInputSchema(def);
        // description is writable but not in expose.select — still included in create input
        expect(schema.properties!['description']).toBeDefined();
        expect(schema.properties!['estimate']).toBeDefined();
      });

      it('Then nullable columns are not required', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityCreateInputSchema(def);
        expect(schema.required).not.toContain('description');
        expect(schema.required).not.toContain('estimate');
      });
    });
  });
});

describe('Feature: Update input schema', () => {
  describe('Given an entity with various column types', () => {
    describe('When entityUpdateInputSchema is called', () => {
      it('Then all writable fields are present but none are required', () => {
        const def = entity('tasks', { model: tasksModel, access: {} });
        const schema = entityUpdateInputSchema(def);

        expect(schema.properties!['title']).toBeDefined();
        expect(schema.properties!['description']).toBeDefined();
        expect(schema.properties!['status']).toBeDefined();
        expect(schema.properties!['estimate']).toBeDefined();
        // PK, readOnly, hidden excluded
        expect(schema.properties!['id']).toBeUndefined();
        expect(schema.properties!['createdAt']).toBeUndefined();
        expect(schema.properties!['updatedAt']).toBeUndefined();
        expect(schema.properties!['passwordHash']).toBeUndefined();
        // No required fields in update
        expect(schema.required).toBeUndefined();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Full OpenAPI spec generation
// ---------------------------------------------------------------------------

describe('Feature: Full OpenAPI spec generation', () => {
  const tasksDef = entity('tasks', {
    model: tasksModel,
    access: {
      list: rules.authenticated(),
      get: rules.authenticated(),
      create: rules.authenticated(),
      update: rules.entitlement('task:update'),
      delete: false,
    },
    expose: {
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        estimate: rules.entitlement('pm:view-estimates'),
      },
      allowWhere: { status: true, createdAt: true },
      allowOrderBy: { createdAt: true, title: true },
      include: {
        comments: {
          select: { id: true, text: true, createdAt: true },
          allowWhere: { createdAt: true },
          allowOrderBy: { createdAt: true },
          maxLimit: 20,
        },
      },
    },
  });

  describe('Given entity definitions', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then spec.openapi is "3.1.0"', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test API', version: '0.1.0' },
        });
        expect(spec.openapi).toBe('3.1.0');
      });

      it('Then spec.info matches provided options', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test API', version: '0.1.0' },
        });
        expect(spec.info.title).toBe('Test API');
        expect(spec.info.version).toBe('0.1.0');
      });

      it('Then generates paths for enabled operations', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        expect(spec.paths['/api/tasks']).toBeDefined();
        expect(spec.paths['/api/tasks/{id}']).toBeDefined();
        expect(spec.paths['/api/tasks/query']).toBeDefined();
      });

      it('Then list, get, create, update operations exist', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        expect(spec.paths['/api/tasks']!.get).toBeDefined();
        expect(spec.paths['/api/tasks']!.post).toBeDefined();
        expect(spec.paths['/api/tasks/{id}']!.get).toBeDefined();
        expect(spec.paths['/api/tasks/{id}']!.patch).toBeDefined();
      });

      it('Then component schemas are defined for response, create, and update', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        expect(spec.components!.schemas!['TasksResponse']).toBeDefined();
        expect(spec.components!.schemas!['TasksCreateInput']).toBeDefined();
        expect(spec.components!.schemas!['TasksUpdateInput']).toBeDefined();
      });

      it('Then ErrorResponse schema is included in components', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        expect(spec.components!.schemas!['ErrorResponse']).toBeDefined();
      });
    });
  });

  describe('Given an entity with access.delete = false', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then DELETE path exists with only a 405 response', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        const deleteOp = spec.paths['/api/tasks/{id}']!.delete!;
        expect(deleteOp).toBeDefined();
        expect(deleteOp.responses['405']).toBeDefined();
      });
    });
  });

  describe('Given an entity with access.create = undefined', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then POST path does not exist', () => {
        const noCreateDef = entity('logs', {
          model: d.model(
            d.table('logs', {
              id: d.uuid().primary(),
              message: d.text(),
            }),
          ),
          access: { list: rules.authenticated() },
        });
        const spec = generateOpenAPISpec([noCreateDef], {
          info: { title: 'Test', version: '1.0' },
        });
        // list exists
        expect(spec.paths['/api/logs']!.get).toBeDefined();
        // create not defined — no POST
        expect(spec.paths['/api/logs']!.post).toBeUndefined();
      });
    });
  });

  describe('Given servers option is provided', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then spec.servers matches provided value', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
          servers: [{ url: 'http://localhost:3000' }],
        });
        expect(spec.servers).toEqual([{ url: 'http://localhost:3000' }]);
      });
    });
  });

  describe('Given servers option is not provided', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then spec.servers is undefined', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        expect(spec.servers).toBeUndefined();
      });
    });
  });

  describe('Given an entity with relation includes', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then relation response schemas are in components.schemas', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        expect(spec.components!.schemas!['TasksCommentsResponse']).toBeDefined();
      });
    });
  });

  describe('Given query parameters from expose config', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then list operation has where params for allowed fields', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        const listOp = spec.paths['/api/tasks']!.get!;
        const paramNames = listOp.parameters!.map((p: { name: string }) => p.name);
        expect(paramNames).toContain('where[status]');
        expect(paramNames).toContain('where[createdAt]');
        expect(paramNames).not.toContain('where[title]');
      });

      it('Then list operation has orderBy param', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        const listOp = spec.paths['/api/tasks']!.get!;
        const paramNames = listOp.parameters!.map((p: { name: string }) => p.name);
        expect(paramNames).toContain('orderBy');
      });

      it('Then list operation has limit, after, and q params', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        const listOp = spec.paths['/api/tasks']!.get!;
        const paramNames = listOp.parameters!.map((p: { name: string }) => p.name);
        expect(paramNames).toContain('limit');
        expect(paramNames).toContain('after');
        expect(paramNames).toContain('q');
      });

      it('Then enum column where param has enum values', () => {
        const spec = generateOpenAPISpec([tasksDef], {
          info: { title: 'Test', version: '1.0' },
        });
        const listOp = spec.paths['/api/tasks']!.get!;
        const statusParam = listOp.parameters!.find(
          (p: { name: string }) => p.name === 'where[status]',
        );
        expect(statusParam!.schema.enum).toEqual(['todo', 'in_progress', 'done']);
      });
    });
  });
});
