# Entity Todo — vertz Demo

A minimal CRUD API built with vertz's entity-first architecture.

**3 files. Zero boilerplate. Full CRUD.**

## The Code

```
src/
  schema.ts     — define your data (14 lines)
  entities.ts   — define your API (12 lines)
  index.ts      — start the server (15 lines)
```

That's it. No modules, no routers, no services, no controllers.
vertz generates typed CRUD endpoints from your entity definition.

## Run it

```bash
bun run dev
```

## Endpoints

All auto-generated from `entity('todos', { model: todosModel })`:

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/todos | List all todos |
| GET | /api/todos/:id | Get a todo by ID |
| POST | /api/todos | Create a todo |
| PATCH | /api/todos/:id | Update a todo |
| DELETE | /api/todos/:id | Delete a todo |

## What This Proves

This demo shows the full vertz entity pipeline:

1. **Schema** → `d.table()` defines your data model
2. **Model** → `d.model()` creates a typed model with CRUD schemas
3. **Entity** → `entity()` generates routes, access rules, and hooks
4. **Server** → `createServer({ entities })` wires everything up

Zero configuration. Type-safe end-to-end. One way to build things.
