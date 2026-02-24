import { describe, expect, it } from 'bun:test';
import { d } from '../../d';

describe('Feature: d.model() and derived schemas', () => {
  const usersTable = d.table('users', {
    id: d.uuid().primary(),
    email: d.text().unique(),
    name: d.text(),
    passwordHash: d.text().hidden(),
    role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
    createdAt: d.timestamp().default('now').readOnly(),
    updatedAt: d.timestamp().autoUpdate(),
  });

  describe('Given a table definition', () => {
    describe('When calling d.model(usersTable)', () => {
      it('Then returns an object with .table equal to the passed table', () => {
        const model = d.model(usersTable);
        expect(model.table).toBe(usersTable);
      });

      it('Then .relations defaults to empty object {}', () => {
        const model = d.model(usersTable);
        expect(model.relations).toEqual({});
      });
    });
  });

  describe('Given a model with hidden column passwordHash', () => {
    describe('When calling schemas.response.parse()', () => {
      it('Then strips hidden fields from data', () => {
        const model = d.model(usersTable);
        const result = model.schemas.response.parse({
          id: '1',
          email: 'a@b.com',
          name: 'Alice',
          passwordHash: 'secret',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        expect(result).not.toHaveProperty('passwordHash');
        expect(result).toHaveProperty('id', '1');
        expect(result).toHaveProperty('email', 'a@b.com');
        expect(result).toHaveProperty('name', 'Alice');
      });
    });
  });

  describe('Given a model with readOnly and primary key columns', () => {
    describe('When calling schemas.createInput.parse()', () => {
      it('Then strips readOnly and primary key fields from data', () => {
        const model = d.model(usersTable);
        const result = model.schemas.createInput.parse({
          email: 'a@b.com',
          name: 'Alice',
          passwordHash: 'hash',
          role: 'editor',
          id: '1',
          createdAt: new Date('2020-01-01'),
          updatedAt: new Date('2020-01-01'),
        });

        // readOnly columns stripped
        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('updatedAt');
        // primary key stripped
        expect(result).not.toHaveProperty('id');
        // regular columns kept
        expect(result).toHaveProperty('email', 'a@b.com');
        expect(result).toHaveProperty('name', 'Alice');
        // hidden but non-readOnly columns kept (intentional — see review T-2)
        expect(result).toHaveProperty('passwordHash', 'hash');
      });
    });
  });

  describe('Given a model with required fields', () => {
    describe('When calling schemas.createInput.parse() with missing required field', () => {
      it('Then throws a validation error', () => {
        const model = d.model(usersTable);
        expect(() =>
          model.schemas.createInput.parse({
            // email is required (no default), omitting it
            name: 'Alice',
            passwordHash: 'hash',
          }),
        ).toThrow();
      });
    });
  });

  describe('Given a model with readOnly and primary key columns', () => {
    describe('When calling schemas.updateInput.parse()', () => {
      it('Then strips readOnly and primary key fields from data (partial update)', () => {
        const model = d.model(usersTable);
        const result = model.schemas.updateInput.parse({
          name: 'Bob',
          id: '1',
          createdAt: new Date('2020-01-01'),
          updatedAt: new Date('2020-01-01'),
        });

        // readOnly columns stripped
        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('updatedAt');
        // primary key stripped
        expect(result).not.toHaveProperty('id');
        // regular columns kept
        expect(result).toHaveProperty('name', 'Bob');
      });
    });
  });

  describe('Given a model with known columns', () => {
    describe('When calling parse() with unknown extra keys', () => {
      it('Then response.parse() strips unknown keys', () => {
        const model = d.model(usersTable);
        const result = model.schemas.response.parse({
          id: '1',
          email: 'a@b.com',
          name: 'Alice',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          totallyBogus: 'should not appear',
        });

        expect(result).not.toHaveProperty('totallyBogus');
        expect(result).toHaveProperty('email', 'a@b.com');
      });

      it('Then createInput.parse() strips unknown keys', () => {
        const model = d.model(usersTable);
        const result = model.schemas.createInput.parse({
          email: 'a@b.com',
          name: 'Alice',
          passwordHash: 'hash',
          bogusField: 'oops',
        });

        expect(result).not.toHaveProperty('bogusField');
        expect(result).toHaveProperty('email', 'a@b.com');
      });

      it('Then updateInput.parse() strips unknown keys', () => {
        const model = d.model(usersTable);
        const result = model.schemas.updateInput.parse({
          name: 'Bob',
          unknownKey: 42,
        });

        expect(result).not.toHaveProperty('unknownKey');
        expect(result).toHaveProperty('name', 'Bob');
      });
    });
  });

  describe('Given a table and relations', () => {
    const postsTable = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text(),
      authorId: d.uuid(),
    });

    const relations = {
      posts: d.ref.many(() => postsTable, 'authorId'),
    };

    describe('When calling d.model(usersTable, relations)', () => {
      it('Then .relations contains the passed relations', () => {
        const model = d.model(usersTable, relations);
        expect(model.relations).toBe(relations);
        expect(model.relations.posts._type).toBe('many');
      });
    });
  });
});
