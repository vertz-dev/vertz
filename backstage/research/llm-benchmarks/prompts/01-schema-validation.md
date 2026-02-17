# Task 1: Define a Schema and Validate Input

## Objective

Define a schema for a User entity and implement runtime validation for user registration input.

## Requirements

### Schema: User
- `id`: UUID, auto-generated
- `email`: string, valid email format
- `name`: string, 2-100 characters
- `age`: number, must be 18 or older
- `role`: enum (admin, user, guest)
- `createdAt`: timestamp

### Validation Rules
- Email must be valid format
- Name must be 2-100 characters
- Age must be >= 18
- Role must be one of: admin, user, guest

## Deliverable

Write code that:
1. Defines the User schema
2. Validates input at runtime
3. Returns clear error messages for invalid input

## Success Criteria

- [ ] Schema is defined with proper types
- [ ] Validation runs on input
- [ ] Error messages are actionable
- [ ] Code compiles without errors
