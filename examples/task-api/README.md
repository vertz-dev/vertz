# Task API Example

A full CRUD task management API built with the vertz stack, demonstrating:

- **@vertz/schema** for request/response validation
- **@vertz/core** for the module system, routing, and HTTP server
- **@vertz/db** for database schema definition and typed ORM

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL (for database operations)

## Quick Start

```bash
# From the monorepo root
bun install

# Start the server
cd examples/task-api
bun run dev
```

The server starts at `http://localhost:3000/api`.

> **Note:** Database operations require a running PostgreSQL instance with `DATABASE_URL` set.
> Without a database, the server boots and routes respond, but queries return 500.
> Schema validation, CORS, 404s, and error formatting all work without a database.

## Environment Variables

| Variable       | Default                              | Description               |
|---------------|--------------------------------------|---------------------------|
| `PORT`        | `3000`                               | Server port               |
| `DATABASE_URL`| `postgres://localhost:5432/task_api` | PostgreSQL connection URL |

## Endpoints

### Users

| Method | Path              | Description       |
|--------|-------------------|-------------------|
| GET    | `/api/users`      | List users        |
| POST   | `/api/users`      | Create a user     |
| GET    | `/api/users/:id`  | Get user by ID    |

### Tasks

| Method | Path              | Description                          |
|--------|-------------------|--------------------------------------|
| GET    | `/api/tasks`      | List tasks (filterable)              |
| POST   | `/api/tasks`      | Create a task                        |
| GET    | `/api/tasks/:id`  | Get task with assignee included      |
| PATCH  | `/api/tasks/:id`  | Update task (status, details, etc.)  |
| DELETE | `/api/tasks/:id`  | Delete a task                        |

### Query Parameters

**GET /api/users:**
- `limit` (number) — max results per page (default: 20)
- `offset` (number) — pagination offset (default: 0)

**GET /api/tasks:**
- `limit` (number) — max results per page (default: 20)
- `offset` (number) — pagination offset (default: 0)
- `status` — filter by status: `todo`, `in_progress`, `done`
- `priority` — filter by priority: `low`, `medium`, `high`, `urgent`
- `assigneeId` (uuid) — filter by assigned user

## Request/Response Examples

### Create a User

```bash
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email": "alice@example.com", "name": "Alice Johnson", "role": "admin"}'
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alice@example.com",
  "name": "Alice Johnson",
  "role": "admin",
  "createdAt": "2026-02-11T10:00:00.000Z"
}
```

### Create a Task

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Implement authentication",
    "description": "Add JWT-based auth to all endpoints",
    "priority": "high",
    "assigneeId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### Update a Task

```bash
curl -X PATCH http://localhost:3000/api/tasks/TASK_ID \
  -H 'Content-Type: application/json' \
  -d '{"status": "in_progress"}'
```

### Filter Tasks

```bash
# Tasks assigned to a specific user
curl "http://localhost:3000/api/tasks?assigneeId=USER_ID"

# Urgent tasks that are still todo
curl "http://localhost:3000/api/tasks?status=todo&priority=urgent"
```

## Validation Errors

The API validates all inputs using @vertz/schema. Invalid requests return 400:

```bash
# Missing required field
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email": "test@example.com"}'
```

Response:
```json
{
  "error": "BadRequestException",
  "message": "Missing required property \"name\" at \"name\"",
  "statusCode": 400,
  "code": "BadRequestException"
}
```

```bash
# Invalid UUID
curl http://localhost:3000/api/users/not-a-uuid
```

Response:
```json
{
  "error": "BadRequestException",
  "message": "Invalid UUID at \"id\"",
  "statusCode": 400,
  "code": "BadRequestException"
}
```

## Project Structure

```
examples/task-api/
  src/
    index.ts                         # App entry point
    seed.ts                          # Database seed script
    db/
      schema.ts                      # Table definitions with d.table()
      index.ts                       # Database instance (createDb)
    schemas/
      user.schemas.ts                # User request/response schemas (s.object)
      task.schemas.ts                # Task request/response schemas
    modules/
      users/
        user.service.ts              # User business logic
        user.module.ts               # User module (moduleDef + service + router)
      tasks/
        task.service.ts              # Task business logic
        task.module.ts               # Task module
```

## Seeding the Database

```bash
bun run seed
```

This inserts 3 sample users and 7 sample tasks. Requires a running database.

## Architecture Notes

This example follows the vertz module pattern:

1. **Schema layer** (`db/schema.ts`) — defines tables with `d.table()` and relations with `d.ref`
2. **Validation layer** (`schemas/`) — defines request/response shapes with `s.object()`
3. **Service layer** (`modules/*/service.ts`) — contains business logic, calls `db` methods
4. **Module layer** (`modules/*/module.ts`) — wires together: `moduleDef` -> `service` -> `router` -> `module`
5. **App** (`index.ts`) — registers modules and starts the server

Each module is self-contained: it defines its own service, router, and exports. The app simply registers modules and they handle everything else.
