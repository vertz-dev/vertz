# Task 3: Set Up Auth (JWT + RBAC)

## Objective

Implement authentication with JWT tokens and role-based access control (RBAC).

## Requirements

### Authentication
- Email/password login
- JWT tokens for session management
- Token expiration: 24 hours
- Password hashing (bcrypt or similar)

### Roles
- `admin`: Full access to all resources
- `user`: Can read all, create/update own resources
- `guest`: Read-only access

### Protected Endpoints
- `GET /admin/users` — Admin only
- `POST /posts` — Authenticated users only
- `GET /posts` — Public (guests)

### Middleware
- Auth middleware to verify JWT
- Role middleware to check permissions

## Deliverable

Implement:
1. User registration and login endpoints
2. JWT token generation and validation
3. Auth middleware
4. Role-based access middleware
5. Protected routes demonstrating RBAC

## Success Criteria

- [ ] Users can register and login
- [ ] JWT tokens are issued on login
- [ ] Auth middleware protects routes
- [ ] RBAC middleware enforces roles
- [ ] Different roles see different access levels
- [ ] Code compiles without errors
