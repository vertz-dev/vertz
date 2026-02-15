// Test fixtures - mock table definitions for domain() tests
// Uses correct @vertz/db API
import { d } from '@vertz/db';

// Simple users table for basic tests
export const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  orgId: d.uuid(),
  passwordHash: d.text().hidden(),
  internalNotes: d.text(),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

// Organizations table for relation tests
export const orgsTable = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
  logo: d.text(),
  billingEmail: d.email(),
  taxId: d.text(),
  createdAt: d.timestamp().default('now'),
});

// Posts table for relation tests
export const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  authorId: d.uuid(),
  title: d.text(),
  content: d.text(),
  published: d.boolean().default(false),
  views: d.integer().default(0),
  createdAt: d.timestamp().default('now'),
});

// Comments table
export const commentsTable = d.table('comments', {
  id: d.uuid().primary(),
  postId: d.uuid(),
  authorId: d.uuid(),
  content: d.text(),
  createdAt: d.timestamp().default('now'),
});

// Audit logs table (sensitive - should not be exposed)
export const auditLogsTable = d.table('audit_logs', {
  id: d.uuid().primary(),
  userId: d.uuid(),
  action: d.text(),
  ipAddress: d.text(),
  userAgent: d.text(),
  createdAt: d.timestamp().default('now'),
});
