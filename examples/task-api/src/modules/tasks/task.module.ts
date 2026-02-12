/**
 * Tasks module — wires the task service and router together.
 *
 * Demonstrates filters on list endpoints, nested relations (include assignee),
 * and PATCH/DELETE operations.
 */
import { vertz } from '@vertz/core';
import {
  createTaskBody,
  listTasksQuery,
  taskIdParams,
  updateTaskBody,
} from '../../schemas/task.schemas';
import { createTaskMethods } from './task.service';

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------

const taskDef = vertz.moduleDef({ name: 'tasks' });

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const taskService = taskDef.service({
  methods: () => createTaskMethods(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const taskRouter = taskDef
  .router({ prefix: '/tasks', inject: { taskService } })
  .get('/', {
    query: listTasksQuery,
    handler: async (ctx) => {
      // NOTE: The cast is needed because @vertz/core's inject system types
      // services as `unknown`. This is a known DX gap — not a @vertz/db issue.
      // Tracked for fix: make router generic over its inject map.
      const svc = ctx.taskService as ReturnType<typeof createTaskMethods>;
      return svc.list({
        limit: ctx.query.limit,
        offset: ctx.query.offset,
        status: ctx.query.status,
        priority: ctx.query.priority,
        assigneeId: ctx.query.assigneeId,
      });
    },
  })
  .post('/', {
    body: createTaskBody,
    handler: async (ctx) => {
      const svc = ctx.taskService as ReturnType<typeof createTaskMethods>;
      return svc.create(ctx.body);
    },
  })
  .get('/:id', {
    params: taskIdParams,
    handler: async (ctx) => {
      const svc = ctx.taskService as ReturnType<typeof createTaskMethods>;
      return svc.getById(ctx.params.id);
    },
  })
  .patch('/:id', {
    params: taskIdParams,
    body: updateTaskBody,
    handler: async (ctx) => {
      const svc = ctx.taskService as ReturnType<typeof createTaskMethods>;
      return svc.update(ctx.params.id, ctx.body);
    },
  })
  .delete('/:id', {
    params: taskIdParams,
    handler: async (ctx) => {
      const svc = ctx.taskService as ReturnType<typeof createTaskMethods>;
      return svc.remove(ctx.params.id);
    },
  });

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const taskModule = vertz.module(taskDef, {
  services: [taskService],
  routers: [taskRouter],
  exports: [taskService],
});
