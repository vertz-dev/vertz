import { d } from '@vertz/db';
import { describe, expect, it } from 'vitest';
import { entity } from '../index';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().hidden(),
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

      it('Then the returned object is frozen', () => {
        const def = entity('users', {
          model: usersModel,
          access: { list: () => true },
        });

        expect(Object.isFrozen(def)).toBe(true);
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

      it('Then .relations defaults to {}', () => {
        const def = entity('users', { model: usersModel });

        expect(def.relations).toEqual({});
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

  describe('Given an entity config with relations', () => {
    describe('When calling entity() with relations config', () => {
      it('Then .relations contains the passed config', () => {
        const def = entity('users', {
          model: usersModel,
          relations: { posts: true },
        });

        expect(def.relations).toEqual({ posts: true });
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
              input: { parse: (v: unknown) => v as { password: string } },
              output: { parse: (v: unknown) => v as { ok: boolean } },
              handler,
            },
          },
        });

        expect(def.actions.resetPassword.handler).toBe(handler);
      });
    });
  });
});
