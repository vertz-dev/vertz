/**
 * Task service — business logic for task CRUD operations.
 */
import { NotFoundException } from '@vertz/core';
import type { FilterType } from '@vertz/db';
import { db } from '../../db';
import { unwrap } from '@vertz/schema';
import type { tasks, users } from '../../db/schema';

// ---------------------------------------------------------------------------
// Inferred types from the database schema — no manual definitions needed.
// ---------------------------------------------------------------------------

/** The row type returned by SELECT queries on the tasks table. */
type Task = typeof tasks.$infer;

/** The row type returned by SELECT queries on the users table. */
type User = typeof users.$infer;

/** The typed where clause for the tasks table. */
type TaskFilter = FilterType<typeof tasks._columns>;

/** The typed update payload for the tasks table. */
type TaskUpdate = typeof tasks.$update;

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: 'todo' | 'in_progress' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string | null;
}

export interface ListTasksInput {
  limit?: number;
  offset?: number;
  status?: 'todo' | 'in_progress' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
}

function serializeTask(task: Task & { assignee?: User | null }) {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignee: task.assignee
      ? serializeAssignee(task.assignee)
      : task.assignee === null
        ? null
        : undefined,
  };
}

function serializeAssignee(assignee: User) {
  return {
    id: assignee.id,
    name: assignee.name,
    email: assignee.email,
  };
}

export function createTaskMethods() {
  return {
    async list(input: ListTasksInput = {}) {
      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;

      // Build where clause from filters — fully typed via FilterType
      const where: TaskFilter = {};
      if (input.status) where.status = input.status;
      if (input.priority) where.priority = input.priority;
      if (input.assigneeId) where.assigneeId = input.assigneeId;

      const result = await db.listAndCount('tasks', {
        where,
        limit,
        offset,
        orderBy: { createdAt: 'desc' },
      });
      const { data, total } = unwrap(result);

      return {
        data: data.map((t) => serializeTask(t)),
        total,
        limit,
        offset,
      };
    },

    async getById(id: string) {
      const result = await db.get('tasks', {
        where: { id },
        include: { assignee: true },
      });
      const task = unwrap(result);

      if (!task) {
        throw new NotFoundException(`Task with id "${id}" not found`);
      }

      return serializeTask(task);
    },

    async create(input: CreateTaskInput) {
      // If assigneeId is provided, verify the user exists
      if (input.assigneeId) {
        const userResult = await db.get('users', {
          where: { id: input.assigneeId },
        });
        const user = unwrap(userResult);
        if (!user) {
          throw new NotFoundException(`Assignee with id "${input.assigneeId}" not found`);
        }
      }

      const now = new Date();
      const result = await db.create('tasks', {
        data: {
          id: crypto.randomUUID(),
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? 'todo',
          priority: input.priority ?? 'medium',
          assigneeId: input.assigneeId ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const task = unwrap(result);

      return serializeTask(task);
    },

    async update(id: string, input: UpdateTaskInput) {
      // If assigneeId is being set, verify the user exists
      if (input.assigneeId) {
        const userResult = await db.get('users', {
          where: { id: input.assigneeId },
        });
        const user = unwrap(userResult);
        if (!user) {
          throw new NotFoundException(`Assignee with id "${input.assigneeId}" not found`);
        }
      }

      // Build typed update payload — only include fields that were provided
      const data: TaskUpdate = {
        updatedAt: new Date(),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
      };

      const result = await db.update('tasks', {
        where: { id },
        data,
      });
      const task = unwrap(result);

      return serializeTask(task);
    },

    async remove(id: string) {
      const result = await db.delete('tasks', {
        where: { id },
      });
      const task = unwrap(result);

      return serializeTask(task);
    },
  };
}
