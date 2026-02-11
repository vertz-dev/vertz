/**
 * User service — business logic for user CRUD operations.
 *
 * Depends on the database instance. In a real app the db would be
 * injected via the module DI system; here we import it directly for
 * simplicity since @vertz/db doesn't yet have a driver phase that
 * supports real Postgres connections at runtime.
 */
import { NotFoundException, ConflictException } from '@vertz/core';
import { db } from '../../db';

export interface CreateUserInput {
  email: string;
  name: string;
  role?: 'admin' | 'member';
}

export interface ListUsersInput {
  limit?: number;
  offset?: number;
}

function serializeUser(user: Record<string, unknown>) {
  return {
    ...user,
    createdAt:
      user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : String(user.createdAt),
  };
}

export function createUserMethods() {
  return {
    async list(input: ListUsersInput = {}) {
      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;

      const { data, total } = await db.findManyAndCount('users', {
        limit,
        offset,
        orderBy: { createdAt: 'desc' },
      });

      return {
        data: data.map((u) => serializeUser(u as Record<string, unknown>)),
        total,
        limit,
        offset,
      };
    },

    async getById(id: string) {
      const user = await db.findOne('users', {
        where: { id },
      });

      if (!user) {
        throw new NotFoundException(`User with id "${id}" not found`);
      }

      return serializeUser(user as Record<string, unknown>);
    },

    async create(input: CreateUserInput) {
      try {
        const user = await db.create('users', {
          data: {
            id: crypto.randomUUID(),
            email: input.email,
            name: input.name,
            role: input.role ?? 'member',
          },
        });

        return serializeUser(user as Record<string, unknown>);
      } catch (error) {
        // Handle unique constraint violations on email
        if (
          error instanceof Error &&
          error.message.includes('unique')
        ) {
          throw new ConflictException(
            `A user with email "${input.email}" already exists`,
          );
        }
        throw error;
      }
    },
  };
}
