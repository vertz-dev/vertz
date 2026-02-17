# Task 2: Create a CRUD API Endpoint

## Objective

Create a REST API with full CRUD operations for a `Post` resource.

## Requirements

### Resource: Post
- `id`: UUID, primary key
- `title`: string, required, max 200 chars
- `content`: string, required
- `published`: boolean, default false
- `authorId`: UUID, foreign key to User
- `createdAt`: timestamp
- `updatedAt`: timestamp

### Endpoints
- `POST /posts` — Create a new post
- `GET /posts` — List all posts (with pagination)
- `GET /posts/:id` — Get a single post by ID
- `PUT /posts/:id` — Update a post
- `DELETE /posts/:id` — Delete a post

### Constraints
- Use REST conventions
- Include proper HTTP status codes
- Add basic input validation
- Use query params for pagination (page, limit)

## Deliverable

Implement all 5 REST endpoints for the Post resource.

## Success Criteria

- [ ] All 5 endpoints implemented
- [ ] Proper HTTP status codes returned
- [ ] Input validation works
- [ ] Pagination works correctly
- [ ] Code compiles without errors
