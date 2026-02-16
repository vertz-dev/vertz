import { createApp, createModule, createModuleDef } from '@vertz/core';

// Define the users module
const moduleDef = createModuleDef({ name: 'users' });
// Create a simple in-memory user service
const userService = moduleDef.service({
  methods: () => {
    const users = new Map([
      ['1', { id: '1', name: 'Alice', email: 'alice@example.com' }],
      ['2', { id: '2', name: 'Bob', email: 'bob@example.com' }],
    ]);
    return {
      findAll: () => Array.from(users.values()),
      findById: (id) => users.get(id) ?? null,
      create: (data) => {
        const id = String(users.size + 1);
        const user = { id, ...data };
        users.set(id, user);
        return user;
      },
      update: (id, data) => {
        const user = users.get(id);
        if (!user) return null;
        const updated = { ...user, ...data };
        users.set(id, updated);
        return updated;
      },
      delete: (id) => {
        const existed = users.has(id);
        users.delete(id);
        return existed;
      },
    };
  },
});
// Create router with service injection
const router = moduleDef.router({
  prefix: '/users',
  inject: { userService },
});
// Define routes
router.get('/', {
  handler: (ctx) => {
    return { users: ctx.userService.findAll() };
  },
});
router.get('/:id', {
  handler: (ctx) => {
    const user = ctx.userService.findById(ctx.params.id);
    if (!user) {
      return { error: 'User not found' };
    }
    return user;
  },
});
router.post('/', {
  handler: (ctx) => {
    const data = ctx.body;
    const user = ctx.userService.create(data);
    return { created: true, user };
  },
});
router.put('/:id', {
  handler: (ctx) => {
    const data = ctx.body;
    const user = ctx.userService.update(ctx.params.id, data);
    if (!user) {
      return { error: 'User not found' };
    }
    return { updated: true, user };
  },
});
router.delete('/:id', {
  handler: (ctx) => {
    const deleted = ctx.userService.delete(ctx.params.id);
    if (!deleted) {
      return { error: 'User not found' };
    }
    return { deleted: true };
  },
});
// Create module
const usersModule = createModule(moduleDef, {
  services: [userService],
  routers: [router],
  exports: [],
});
// Create and start app
const app = createApp({}).register(usersModule);
const server = await app.listen(3000);
console.log(`\n✅ Server running on http://${server.hostname}:${server.port}`);
console.log('\nTry these commands:');
console.log('  curl http://localhost:3000/users');
console.log('  curl http://localhost:3000/users/1');
console.log(
  '  curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d \'{"name":"Charlie","email":"charlie@example.com"}\'',
);
//# sourceMappingURL=index.js.map
