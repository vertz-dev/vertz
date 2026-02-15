import { createModule, createModuleDef } from '@vertz/core';

const moduleDef = createModuleDef({ name: 'users' });

const userService = moduleDef.service({
  methods: () => ({
    findAll: () => [],
    findById: (id: string) => ({ id, name: 'User' }),
  }),
});

const router = moduleDef.router({
  prefix: '/users',
  inject: { userService },
});

router.get('/', {
  handler: (ctx) => ctx.userService.findAll(),
});

router.get('/:id', {
  handler: (ctx) => ctx.userService.findById(ctx.params.id),
});

export const usersModule = createModule(moduleDef, {
  services: [userService],
  routers: [router],
  exports: [],
});
