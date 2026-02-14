# Basic API Example

A simple REST API built with `@vertz/core` demonstrating CRUD operations with dependency injection.

## Features

- ✅ Service-based architecture with dependency injection
- ✅ Full CRUD operations (Create, Read, Update, Delete)
- ✅ In-memory data store
- ✅ Type-safe route handlers
- ✅ RESTful routing patterns

## Running the Example

```bash
# Install dependencies (from workspace root)
bun install

# Run the server
cd packages/core/examples/basic-api
bun run dev
```

The server will start on http://localhost:3000

## API Endpoints

### GET /users

List all users.

```bash
curl http://localhost:3000/users
```

Response:
```json
{
  "users": [
    { "id": "1", "name": "Alice", "email": "alice@example.com" },
    { "id": "2", "name": "Bob", "email": "bob@example.com" }
  ]
}
```

### GET /users/:id

Get a single user by ID.

```bash
curl http://localhost:3000/users/1
```

Response:
```json
{
  "id": "1",
  "name": "Alice",
  "email": "alice@example.com"
}
```

### POST /users

Create a new user.

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Charlie","email":"charlie@example.com"}'
```

Response:
```json
{
  "created": true,
  "user": {
    "id": "3",
    "name": "Charlie",
    "email": "charlie@example.com"
  }
}
```

### PUT /users/:id

Update an existing user.

```bash
curl -X PUT http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Smith"}'
```

Response:
```json
{
  "updated": true,
  "user": {
    "id": "1",
    "name": "Alice Smith",
    "email": "alice@example.com"
  }
}
```

### DELETE /users/:id

Delete a user.

```bash
curl -X DELETE http://localhost:3000/users/1
```

Response:
```json
{
  "deleted": true
}
```

## Code Structure

- **Service Layer**: `userService` encapsulates all business logic and data access
- **Router Layer**: `router` defines HTTP endpoints and delegates to services
- **Module**: Packages services and routers into a cohesive unit
- **App**: Registers modules and starts the server

This separation allows for:
- Easy testing (mock services in tests)
- Reusability (services can be used by multiple routers)
- Scalability (add more modules as the app grows)

## Next Steps

Try these exercises to learn more:

1. **Add validation**: Use `@vertz/schema` to validate request bodies
2. **Add authentication**: Create middleware that checks for an API key
3. **Add database**: Replace the in-memory Map with `@vertz/db`
4. **Add tests**: Use `@vertz/testing` to test the routes and services
