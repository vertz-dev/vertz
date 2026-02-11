/**
 * Users module — wires the user service and router together.
 *
 * Demonstrates the vertz module system: moduleDef -> service -> router -> module.
 */
import { vertz } from '@vertz/core';
import {
  createUserBody,
  listUsersQuery,
  userIdParams,
} from '../../schemas/user.schemas';
import { createUserMethods } from './user.service';

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------

const userDef = vertz.moduleDef({ name: 'users' });

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const userService = userDef.service({
  methods: () => createUserMethods(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const userRouter = userDef
  .router({ prefix: '/users', inject: { userService } })
  .get('/', {
    query: listUsersQuery,
    handler: async (ctx) => {
      // NOTE: The cast is needed because @vertz/core's inject system types
      // services as `unknown`. This is a known DX gap — not a @vertz/db issue.
      // Tracked for fix: make router generic over its inject map.
      const svc = ctx.userService as ReturnType<typeof createUserMethods>;
      return svc.list({
        limit: ctx.query.limit,
        offset: ctx.query.offset,
      });
    },
  })
  .post('/', {
    body: createUserBody,
    handler: async (ctx) => {
      const svc = ctx.userService as ReturnType<typeof createUserMethods>;
      return svc.create(ctx.body);
    },
  })
  .get('/:id', {
    params: userIdParams,
    handler: async (ctx) => {
      const svc = ctx.userService as ReturnType<typeof createUserMethods>;
      return svc.getById(ctx.params.id);
    },
  });

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const userModule = vertz.module(userDef, {
  services: [userService],
  routers: [userRouter],
  exports: [userService],
});
