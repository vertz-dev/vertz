/**
 * User service — business logic for user CRUD operations.
 *
 * Depends on the database instance. In a real app the db would be
 * injected via the module DI system; here we import it directly for
 * simplicity since @vertz/db doesn't yet have a driver phase that
 * supports real Postgres connections at runtime.
 */
import { ConflictException, NotFoundException } from '@vertz/core';
import { db } from '../../db';
import { unwrap } from '@vertz/schema';
import type { users } from '../../db/schema';

// ---------------------------------------------------------------------------
// Inferred types from the database schema — no manual definitions needed.
// ---------------------------------------------------------------------------

/** The row type returned by SELECT queries on the users table. */
type User = typeof users.$infer;

export interface CreateUserInput {
  email: string;
  name: string;
  role?: 'admin' | 'member';
}

export interface ListUsersInput {
  limit?: number;
  offset?: number;
}

function serializeUser(user: User) {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
  };
}

export function createUserMethods() {
  return {
    async list(input: ListUsersInput = {}) {
      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;

      const result = await db.users.listAndCount({
        limit,
        offset,
        orderBy: { createdAt: 'desc' },
      });
      const { data, total } = unwrap(result);

      return {
        data: data.map((u) => serializeUser(u)),
        total,
        limit,
        offset,
      };
    },

    async getById(id: string) {
      const result = await db.users.get({
        where: { id },
      });
      const user = unwrap(result);

      if (!user) {
        throw new NotFoundException(`User with id "${id}" not found`);
      }

      return serializeUser(user);
    },

    async create(input: CreateUserInput) {
      try {
        const result = await db.users.create({
          data: {
            id: crypto.randomUUID(),
            email: input.email,
            name: input.name,
            role: input.role ?? 'member',
          },
        });
        const user = unwrap(result);

        return serializeUser(user);
      } catch (error) {
        // Handle unique constraint violations on email
        if (error instanceof Error && error.message.includes('unique')) {
          throw new ConflictException(`A user with email "${input.email}" already exists`);
        }
        throw error;
      }
    },
  };
}
