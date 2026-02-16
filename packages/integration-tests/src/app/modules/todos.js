import { s } from '@vertz/schema';
import { createModule, createModuleDef, NotFoundException } from '@vertz/server';
export function createTodosModule(userService) {
  const store = new Map();
  const moduleDef = createModuleDef({ name: 'todos' });
  const todoService = moduleDef.service({
    methods: () => ({
      list: (userId) => {
        const todos = [...store.values()];
        return userId ? todos.filter((t) => t.userId === userId) : todos;
      },
      findById: (id) => {
        const todo = store.get(id);
        if (!todo) throw new NotFoundException(`Todo ${id} not found`);
        return todo;
      },
      create: (data) => {
        const id = crypto.randomUUID();
        const todo = { id, ...data, done: false };
        store.set(id, todo);
        return todo;
      },
      toggleComplete: (id) => {
        const todo = store.get(id);
        if (!todo) throw new NotFoundException(`Todo ${id} not found`);
        const updated = { ...todo, done: !todo.done };
        store.set(id, updated);
        return updated;
      },
      remove: (id) => {
        if (!store.has(id)) throw new NotFoundException(`Todo ${id} not found`);
        store.delete(id);
      },
    }),
  });
  const router = moduleDef.router({
    prefix: '/todos',
    inject: { todoService, userService },
  });
  router.get('/', {
    handler: (ctx) => {
      const svc = ctx.todoService;
      const userId = ctx.query.userId;
      return svc.list(userId);
    },
  });
  router.get('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService;
      return svc.findById(ctx.params.id);
    },
  });
  router.post('/', {
    body: s.object({ title: s.string().min(1), userId: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService;
      const uSvc = ctx.userService;
      const body = ctx.body;
      // Verify user exists (cross-module DI)
      uSvc.findById(body.userId);
      return svc.create(body);
    },
  });
  router.patch('/:id/complete', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService;
      return svc.toggleComplete(ctx.params.id);
    },
  });
  router.delete('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService;
      svc.remove(ctx.params.id);
      return undefined;
    },
  });
  const module = createModule(moduleDef, {
    services: [todoService],
    routers: [router],
    exports: [todoService],
  });
  return { module, todoService };
}
//# sourceMappingURL=todos.js.map
