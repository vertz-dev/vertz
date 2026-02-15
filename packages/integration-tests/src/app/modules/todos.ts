import { s } from '@vertz/schema';
import {
  createModule,
  createModuleDef,
  type NamedModule,
  type NamedServiceDef,
  NotFoundException,
} from '@vertz/server';

interface Todo {
  id: string;
  title: string;
  userId: string;
  done: boolean;
}

interface TodoService {
  list(userId?: string): Todo[];
  findById(id: string): Todo;
  create(data: { title: string; userId: string }): Todo;
  toggleComplete(id: string): Todo;
  remove(id: string): void;
}

interface UserServiceLike {
  findById(id: string): unknown;
}

export function createTodosModule(userService: NamedServiceDef): {
  module: NamedModule;
  todoService: NamedServiceDef;
} {
  const store = new Map<string, Todo>();

  const moduleDef = createModuleDef({ name: 'todos' });

  const todoService = moduleDef.service({
    methods: (): TodoService => ({
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
        const todo: Todo = { id, ...data, done: false };
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
      const svc = ctx.todoService as TodoService;
      const userId = (ctx.query as Record<string, string | undefined>).userId;
      return svc.list(userId);
    },
  });

  router.get('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService as TodoService;
      return svc.findById(ctx.params.id as string);
    },
  });

  router.post('/', {
    body: s.object({ title: s.string().min(1), userId: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService as TodoService;
      const uSvc = ctx.userService as UserServiceLike;
      const body = ctx.body as { title: string; userId: string };
      // Verify user exists (cross-module DI)
      uSvc.findById(body.userId);
      return svc.create(body);
    },
  });

  router.patch('/:id/complete', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService as TodoService;
      return svc.toggleComplete(ctx.params.id as string);
    },
  });

  router.delete('/:id', {
    params: s.object({ id: s.string() }),
    handler: (ctx) => {
      const svc = ctx.todoService as TodoService;
      svc.remove(ctx.params.id as string);
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
