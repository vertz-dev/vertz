import { s } from '@vertz/schema';
import {
  createModule,
  createModuleDef,
  type NamedModule,
  type NamedServiceDef,
  NotFoundException,
} from '@vertz/server';

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserService {
  list(): User[];
  findById(id: string): User;
  create(data: { name: string; email: string }): User;
  update(id: string, data: { name?: string; email?: string }): User;
  remove(id: string): void;
}

export function createUsersModule(): {
  module: NamedModule;
  userService: NamedServiceDef;
} {
  const store = new Map<string, User>();

  const moduleDef = createModuleDef({ name: 'users' });

  const userService = moduleDef.service({
    methods: (): UserService => ({
      list: () => [...store.values()],
      findById: (id) => {
        const user = store.get(id);
        if (!user) throw new NotFoundException(`User ${id} not found`);
        return user;
      },
      create: (data) => {
        const id = crypto.randomUUID();
        const user: User = { id, ...data };
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
      const svc = ctx.userService as UserService;
      const name = (ctx.query as Record<string, string | undefined>).name;
      const users = svc.list();
      return name ? users.filter((u) => u.name.toLowerCase().includes(name.toLowerCase())) : users;
    },
  });

  router.get('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.userService as UserService;
      return svc.findById(ctx.params.id as string);
    },
  });

  router.post('/', {
    body: s.object({ name: s.string().min(1), email: s.email() }),
    handler: (ctx) => {
      const svc = ctx.userService as UserService;
      return svc.create(ctx.body as { name: string; email: string });
    },
  });

  router.put('/:id', {
    params: s.object({ id: s.string() }),
    body: s.object({ name: s.string().min(1), email: s.email() }),
    handler: (ctx) => {
      const svc = ctx.userService as UserService;
      return svc.update(ctx.params.id as string, ctx.body as { name: string; email: string });
    },
  });

  router.delete('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.userService as UserService;
      svc.remove(ctx.params.id as string);
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
