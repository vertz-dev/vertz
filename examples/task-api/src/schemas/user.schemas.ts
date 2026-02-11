/**
 * User validation schemas — request/response schemas for the users module.
 */
import { s } from '@vertz/schema';
import { USER_ROLES } from '../db/schema';

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const createUserBody = s.object({
  email: s.email(),
  name: s.string().min(1).max(100),
  role: s.enum(USER_ROLES).optional(),
});

export const userIdParams = s.object({
  id: s.uuid(),
});

export const listUsersQuery = s.object({
  limit: s.coerce.number().optional(),
  offset: s.coerce.number().optional(),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const userResponse = s.object({
  id: s.uuid(),
  email: s.email(),
  name: s.string(),
  role: s.enum(USER_ROLES),
  createdAt: s.string(),
});

export const userListResponse = s.object({
  data: s.array(userResponse),
  total: s.number(),
  limit: s.number(),
  offset: s.number(),
});
