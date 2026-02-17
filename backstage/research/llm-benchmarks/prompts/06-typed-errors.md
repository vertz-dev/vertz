# Task 6: Handle Errors with Typed Error Responses

## Objective

Implement proper error handling with typed, consistent error responses across the API.

## Requirements

### Error Types

Define error types:
- `ValidationError` — Invalid input (400)
- `NotFoundError` — Resource not found (404)
- `UnauthorizedError` — Not authenticated (401)
- `ForbiddenError` — Not authorized (403)
- `ConflictError` — Resource conflict (409)
- `InternalError` — Server error (500)

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {
      "field": "email",
      "reason": "invalid format"
    }
  }
}
```

### Implementation
- Create error classes with proper codes
- Create middleware to handle errors consistently
- Ensure all API errors return typed responses
- Include error details where applicable

## Deliverable

Implement:
1. Error class hierarchy
2. Error handling middleware
3. Convert existing endpoints to use typed errors
4. Ensure all error responses follow the format

## Success Criteria

- [ ] Error classes are typed properly
- [ ] All endpoints return typed error responses
- [ ] Error codes are consistent
- [ ] Error details are included where applicable
- [ ] Code compiles without errors
