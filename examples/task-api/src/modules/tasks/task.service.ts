/**
 * Task service — business logic for task CRUD operations.
 */
import { NotFoundException } from '@vertz/core';
import { db } from '../../db';

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

function serializeTask(task: Record<string, unknown>) {
  return {
    ...task,
    createdAt:
      task.createdAt instanceof Date
        ? task.createdAt.toISOString()
        : String(task.createdAt),
    updatedAt:
      task.updatedAt instanceof Date
        ? task.updatedAt.toISOString()
        : String(task.updatedAt),
    assignee: task.assignee
      ? serializeAssignee(task.assignee as Record<string, unknown>)
      : task.assignee === null
        ? null
        : undefined,
  };
}

function serializeAssignee(assignee: Record<string, unknown>) {
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

      // Build where clause from filters
      const where: Record<string, unknown> = {};
      if (input.status) where.status = input.status;
      if (input.priority) where.priority = input.priority;
      if (input.assigneeId) where.assigneeId = input.assigneeId;

      const { data, total } = await db.findManyAndCount('tasks', {
        where,
        limit,
        offset,
        orderBy: { createdAt: 'desc' },
      });

      return {
        data: data.map((t) => serializeTask(t as Record<string, unknown>)),
        total,
        limit,
        offset,
      };
    },

    async getById(id: string) {
      const task = await db.findOne('tasks', {
        where: { id },
        include: { assignee: true },
      });

      if (!task) {
        throw new NotFoundException(`Task with id "${id}" not found`);
      }

      return serializeTask(task as Record<string, unknown>);
    },

    async create(input: CreateTaskInput) {
      // If assigneeId is provided, verify the user exists
      if (input.assigneeId) {
        const user = await db.findOne('users', {
          where: { id: input.assigneeId },
        });
        if (!user) {
          throw new NotFoundException(
            `Assignee with id "${input.assigneeId}" not found`,
          );
        }
      }

      const now = new Date();
      const task = await db.create('tasks', {
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

      return serializeTask(task as Record<string, unknown>);
    },

    async update(id: string, input: UpdateTaskInput) {
      // If assigneeId is being set, verify the user exists
      if (input.assigneeId) {
        const user = await db.findOne('users', {
          where: { id: input.assigneeId },
        });
        if (!user) {
          throw new NotFoundException(
            `Assignee with id "${input.assigneeId}" not found`,
          );
        }
      }

      const data: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.status !== undefined) data.status = input.status;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;

      const task = await db.update('tasks', {
        where: { id },
        data,
      });

      return serializeTask(task as Record<string, unknown>);
    },

    async remove(id: string) {
      const task = await db.delete('tasks', {
        where: { id },
      });

      return serializeTask(task as Record<string, unknown>);
    },
  };
}
