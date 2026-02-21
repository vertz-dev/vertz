/**
 * Database schema — defines the users and tasks tables with relations.
 *
 * Uses @vertz/db column builders for type-safe table definitions.
 */
import { d } from '@vertz/db';

// ---------------------------------------------------------------------------
// Shared enum values (used by both db columns and validation schemas)
// ---------------------------------------------------------------------------

export const USER_ROLES = ['admin', 'member'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = d.table('users', {
  id: d.uuid().primary(),
  email: d.email().unique(),
  name: d.text(),
  role: d.enum('user_role', USER_ROLES).default('member'),
  createdAt: d.timestamp().default('now'),
});

export const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  description: d.text().nullable(),
  status: d.enum('task_status', TASK_STATUSES).default('todo'),
  priority: d.enum('task_priority', TASK_PRIORITIES).default('medium'),
  assigneeId: d.uuid().nullable().references('users'),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

// ---------------------------------------------------------------------------
// Model registry with relations
// ---------------------------------------------------------------------------

export const models = {
  users: d.model(users, {
    tasks: d.ref.many(() => tasks, 'assigneeId'),
  }),
  tasks: d.model(tasks, {
    assignee: d.ref.one(() => users, 'assigneeId'),
  }),
} as const;
