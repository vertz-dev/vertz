import { s } from '@vertz/schema';
import { createModule, createModuleDef, NotFoundException } from '@vertz/server';
export function createUsersModule() {
  const store = new Map();
  const moduleDef = createModuleDef({ name: 'users' });
  const userService = moduleDef.service({
    methods: () => ({
      list: () => [...store.values()],
      findById: (id) => {
        const user = store.get(id);
        if (!user) throw new NotFoundException(`User ${id} not found`);
        return user;
      },
      create: (data) => {
        const id = crypto.randomUUID();
        const user = { id, ...data };
        store.set(id, user);
        return user;
      },
      update: (id, data) => {
        const user = store.get(id);
        if (!user) throw new NotFoundException(`User ${id} not found`);
        const updated = { ...user, ...data };
        store.set(id, updated);
        return updated;
      },
      remove: (id) => {
        if (!store.has(id)) throw new NotFoundException(`User ${id} not found`);
        store.delete(id);
      },
    }),
  });
  const router = moduleDef.router({ prefix: '/users', inject: { userService } });
  router.get('/', {
    handler: (ctx) => {
      const svc = ctx.userService;
      const name = ctx.query.name;
      const users = svc.list();
      return name ? users.filter((u) => u.name.toLowerCase().includes(name.toLowerCase())) : users;
    },
  });
  router.get('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.userService;
      return svc.findById(ctx.params.id);
    },
  });
  router.post('/', {
    body: s.object({ name: s.string().min(1), email: s.email() }),
    handler: (ctx) => {
      const svc = ctx.userService;
      return svc.create(ctx.body);
    },
  });
  router.put('/:id', {
    params: s.object({ id: s.string() }),
    body: s.object({ name: s.string().min(1), email: s.email() }),
    handler: (ctx) => {
      const svc = ctx.userService;
      return svc.update(ctx.params.id, ctx.body);
    },
  });
  router.delete('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.userService;
      svc.remove(ctx.params.id);
      return undefined;
    },
  });
  const module = createModule(moduleDef, {
    services: [userService],
    routers: [router],
    exports: [userService],
  });
  return { module, userService };
}
//# sourceMappingURL=users.js.map
