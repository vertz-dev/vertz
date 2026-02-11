/**
 * Task validation schemas — request/response schemas for the tasks module.
 */
import { s } from '@vertz/schema';
import { TASK_STATUSES, TASK_PRIORITIES } from '../db/schema';

// ---------------------------------------------------------------------------
// Shared enums (derived from database schema constants)
// ---------------------------------------------------------------------------

const taskStatus = s.enum(TASK_STATUSES);
const taskPriority = s.enum(TASK_PRIORITIES);

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const createTaskBody = s.object({
  title: s.string().min(1).max(200),
  description: s.string().max(2000).optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  assigneeId: s.uuid().optional(),
});

export const updateTaskBody = s.object({
  title: s.string().min(1).max(200).optional(),
  description: s.string().max(2000).nullable().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  assigneeId: s.uuid().nullable().optional(),
});

export const taskIdParams = s.object({
  id: s.uuid(),
});

export const listTasksQuery = s.object({
  limit: s.coerce.number().optional(),
  offset: s.coerce.number().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  assigneeId: s.uuid().optional(),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const assigneeResponse = s.object({
  id: s.uuid(),
  name: s.string(),
  email: s.email(),
});

export const taskResponse = s.object({
  id: s.uuid(),
  title: s.string(),
  description: s.string().nullable(),
  status: taskStatus,
  priority: taskPriority,
  assigneeId: s.uuid().nullable(),
  createdAt: s.string(),
  updatedAt: s.string(),
});

export const taskWithAssigneeResponse = taskResponse.extend({
  assignee: assigneeResponse.nullable(),
});

export const taskListResponse = s.object({
  data: s.array(taskResponse),
  total: s.number(),
  limit: s.number(),
  offset: s.number(),
});
