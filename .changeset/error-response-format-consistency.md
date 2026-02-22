---
'@vertz/core': patch
---

Standardize error response codes across all exception classes.

- HTTP exceptions now use short codes (`NotFound`, `BadRequest`, `Unauthorized`, etc.) instead of class names (`NotFoundException`, `BadRequestException`, etc.) in `toJSON()` output
- `ValidationException.toJSON()` now returns `details` instead of `errors` for the validation array, consistent with the entity error handler format
- All framework error responses (`404 Not Found`, `405 Method Not Allowed`, `500 Internal Server Error`) use the same `{ error: { code, message } }` structure
