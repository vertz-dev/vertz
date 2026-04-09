import { describe, expect, it } from '@vertz/test';
import { d } from '@vertz/db';
import { entity } from '../index';
import type { EntityConfig } from '../types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  authorId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const usersModel = d.model(usersTable, {
  posts: d.ref.many(() => postsTable, 'authorId'),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: entity() definition', () => {
  describe('Given a valid entity config with model and access rules', () => {
    describe('When calling entity("users", config)', () => {
      it('Then returns an object with name "users"', () => {
        const def = entity('users', {
          model: usersModel,
          access: {
            list: () => true,
          },
        });

        expect(def.name).toBe('users');
      });

      it('Then returns an object with kind "entity"', () => {
        const def = entity('users', {
          model: usersModel,
          access: { list: () => true },
        });

        expect(def.kind).toBe('entity');
      });

      it('Then the returned object is frozen', () => {
        const def = entity('users', {
          model: usersModel,
          access: { list: () => true },
        });

        expect(Object.isFrozen(def)).toBe(true);
      });

      it('Then nested objects are also frozen (deep freeze)', () => {
        const def = entity('users', {
          model: usersModel,
          access: { list: () => true },
          before: { create: (data) => data },
          after: { create: () => {} },
          expose: { select: { id: true }, include: { posts: true } },
        });

        expect(Object.isFrozen(def.access)).toBe(true);
        expect(Object.isFrozen(def.before)).toBe(true);
        expect(Object.isFrozen(def.after)).toBe(true);
        expect(Object.isFrozen(def.expose)).toBe(true);
      });

      it('Then .model is the passed model', () => {
        const def = entity('users', {
          model: usersModel,
          access: { list: () => true },
        });

        expect(def.model).toBe(usersModel);
      });

      it('Then .access contains the passed access rules', () => {
        const listRule = () => true;
        const def = entity('users', {
          model: usersModel,
          access: { list: listRule },
        });

        expect(def.access.list).toBe(listRule);
      });
    });
  });

  describe('Given an entity config with no optional fields', () => {
    describe('When calling entity() with only model', () => {
      it('Then .access defaults to {}', () => {
        const def = entity('users', { model: usersModel });

        expect(def.access).toEqual({});
      });

      it('Then .before defaults to {}', () => {
        const def = entity('users', { model: usersModel });

        expect(def.before).toEqual({});
      });

      it('Then .after defaults to {}', () => {
        const def = entity('users', { model: usersModel });

        expect(def.after).toEqual({});
      });

      it('Then .actions defaults to {}', () => {
        const def = entity('users', { model: usersModel });

        expect(def.actions).toEqual({});
      });

      it('Then .expose defaults to undefined', () => {
        const def = entity('users', { model: usersModel });

        expect(def.expose).toBeUndefined();
      });
    });
  });

  describe('Given an entity config with before/after hooks', () => {
    describe('When calling entity() with before and after', () => {
      it('Then .before contains the passed hooks', () => {
        const beforeCreate = (data: unknown) => data;
        const def = entity('users', {
          model: usersModel,
          before: { create: beforeCreate },
        });

        expect(def.before.create).toBe(beforeCreate);
      });

      it('Then .after contains the passed hooks', () => {
        const afterCreate = () => {};
        const def = entity('users', {
          model: usersModel,
          after: { create: afterCreate },
        });

        expect(def.after.create).toBe(afterCreate);
      });
    });
  });

  describe('Given an entity config with expose', () => {
    describe('When calling entity() with expose config', () => {
      it('Then .expose contains the passed config', () => {
        const def = entity('users', {
          model: usersModel,
          expose: {
            select: { id: true, name: true },
            include: { posts: true },
          },
        });

        expect(def.expose).toEqual({
          select: { id: true, name: true },
          include: { posts: true },
        });
      });
    });
  });

  describe('Given an invalid entity name', () => {
    describe('When calling entity() with an empty name', () => {
      it('Then throws with a descriptive error', () => {
        expect(() => entity('', { model: usersModel })).toThrow(
          /entity\(\) name must be a non-empty lowercase string/,
        );
      });
    });

    describe('When calling entity() with special characters', () => {
      it('Then rejects names with slashes', () => {
        expect(() => entity('users/admin', { model: usersModel })).toThrow(/entity\(\) name/);
      });

      it('Then rejects names starting with numbers', () => {
        expect(() => entity('1users', { model: usersModel })).toThrow(/entity\(\) name/);
      });

      it('Then rejects names with uppercase', () => {
        expect(() => entity('Users', { model: usersModel })).toThrow(/entity\(\) name/);
      });
    });

    describe('When calling entity() with valid names', () => {
      it('Then accepts simple lowercase names', () => {
        expect(() => entity('users', { model: usersModel })).not.toThrow();
      });

      it('Then accepts names with hyphens', () => {
        expect(() => entity('user-profiles', { model: usersModel })).not.toThrow();
      });

      it('Then accepts names with numbers', () => {
        expect(() => entity('users2', { model: usersModel })).not.toThrow();
      });
    });
  });

  describe('Given an entity config without model', () => {
    describe('When calling entity() without model', () => {
      it('Then throws with a descriptive error', () => {
        expect(() => entity('users', {} as EntityConfig)).toThrow(/entity\(\) requires a model/);
      });
    });
  });

  describe('Given a model with tenantId column', () => {
    const tenantTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
      tenantId: d.uuid(),
    });
    const tenantModel = d.model(tenantTable);

    describe('When calling entity() without explicit tenantScoped', () => {
      it('Then tenantScoped defaults to true', () => {
        const def = entity('tasks', { model: tenantModel });
        expect(def.tenantScoped).toBe(true);
      });

      it('Then tenantColumn defaults to "tenantId"', () => {
        const def = entity('tasks', { model: tenantModel });
        expect(def.tenantColumn).toBe('tenantId');
      });
    });

    describe('When calling entity() with tenantScoped: false', () => {
      it('Then tenantScoped is false', () => {
        const def = entity('tasks', { model: tenantModel, tenantScoped: false });
        expect(def.tenantScoped).toBe(false);
      });

      it('Then tenantColumn is null', () => {
        const def = entity('tasks', { model: tenantModel, tenantScoped: false });
        expect(def.tenantColumn).toBeNull();
      });
    });
  });

  describe('Given a model with a custom tenant FK column via ref.one to .tenant() root', () => {
    const orgsTable = d.table('organizations', { id: d.uuid().primary(), name: d.text() }).tenant();
    const employeesTable = d.table('employees', {
      id: d.uuid().primary(),
      name: d.text(),
      organizationId: d.uuid(),
    });
    const employeesModel = d.model(employeesTable, {
      organization: d.ref.one(() => orgsTable, 'organizationId'),
    });

    describe('When calling entity() without explicit tenantScoped', () => {
      it('Then tenantScoped defaults to true', () => {
        const def = entity('employees', { model: employeesModel });
        expect(def.tenantScoped).toBe(true);
      });

      it('Then tenantColumn resolves to the relation FK ("organizationId")', () => {
        const def = entity('employees', { model: employeesModel });
        expect(def.tenantColumn).toBe('organizationId');
      });
    });
  });

  describe('Given a model without tenantId column', () => {
    describe('When calling entity() without explicit tenantScoped', () => {
      it('Then tenantScoped defaults to false', () => {
        const def = entity('users', { model: usersModel });
        expect(def.tenantScoped).toBe(false);
      });

      it('Then tenantColumn is null', () => {
        const def = entity('users', { model: usersModel });
        expect(def.tenantColumn).toBeNull();
      });
    });
  });

  describe('Given an entity with table override', () => {
    describe('When calling entity() with table property', () => {
      it('Then .table contains the override value', () => {
        const def = entity('admin-users', { model: usersModel, table: 'users' });
        expect(def.table).toBe('users');
      });
    });

    describe('When calling entity() without table property', () => {
      it('Then .table defaults to entity name', () => {
        const def = entity('users', { model: usersModel });
        expect(def.table).toBe('users');
      });
    });
  });

  describe('Given an entity config with custom actions', () => {
    describe('When calling entity() with actions', () => {
      it('Then .actions contains the passed actions', () => {
        const handler = async () => ({ ok: true });
        const def = entity('users', {
          model: usersModel,
          actions: {
            resetPassword: {
              body: { parse: (v: unknown) => v as { password: string } },
              response: { parse: (v: unknown) => v as { ok: boolean } },
              handler,
            },
          },
        });

        expect(def.actions.resetPassword.handler).toBe(handler);
      });
    });
  });
});
