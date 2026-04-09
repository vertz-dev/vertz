import { describe, expect, it } from '@vertz/test';
import type { User } from '../auth-types';
import { getUserDisplayName, getUserInitials } from '../user-display';

describe('getUserDisplayName', () => {
  it('returns name when user has a string name', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: 'Jane Doe' };
    expect(getUserDisplayName(user)).toBe('Jane Doe');
  });

  it('returns email when user has no name', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user' };
    expect(getUserDisplayName(user)).toBe('jane@example.com');
  });

  it('returns "Unknown" by default when no name and no email', () => {
    const user: User = { id: '1', email: '', role: 'user' };
    expect(getUserDisplayName(user)).toBe('Unknown');
  });

  it('returns custom fallback for null user', () => {
    expect(getUserDisplayName(null, '—')).toBe('—');
  });

  it('returns custom fallback for undefined user', () => {
    expect(getUserDisplayName(undefined, '—')).toBe('—');
  });

  it('falls through to email when name is non-string (number)', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: 42 };
    expect(getUserDisplayName(user)).toBe('jane@example.com');
  });

  it('falls through to email when name is empty string', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: '' };
    expect(getUserDisplayName(user)).toBe('jane@example.com');
  });

  it('falls through to email when name is whitespace-only', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: '   ' };
    expect(getUserDisplayName(user)).toBe('jane@example.com');
  });

  it('trims leading and trailing whitespace from name', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: '  Jane Doe  ' };
    expect(getUserDisplayName(user)).toBe('Jane Doe');
  });
});

describe('getUserInitials', () => {
  it('returns first and last initials for two-word name', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: 'Jane Doe' };
    expect(getUserInitials(user)).toBe('JD');
  });

  it('returns single initial for single-word name', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: 'Jane' };
    expect(getUserInitials(user)).toBe('J');
  });

  it('returns first and last initials for 3+ word name (max 2 chars)', () => {
    const user: User = {
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      name: 'Mary Jane Watson',
    };
    expect(getUserInitials(user)).toBe('MW');
  });

  it('returns first char of email when no name', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user' };
    expect(getUserInitials(user)).toBe('J');
  });

  it('returns "?" for null user', () => {
    expect(getUserInitials(null)).toBe('?');
  });

  it('returns "?" for undefined user', () => {
    expect(getUserInitials(undefined)).toBe('?');
  });

  it('falls through to email when name is non-string', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: 42 };
    expect(getUserInitials(user)).toBe('J');
  });

  it('returns "?" when name is whitespace-only', () => {
    const user: User = { id: '1', email: '', role: 'user', name: '   ' };
    expect(getUserInitials(user)).toBe('?');
  });

  it('returns email initial when name is whitespace-only and email exists', () => {
    const user: User = { id: '1', email: 'jane@example.com', role: 'user', name: '   ' };
    expect(getUserInitials(user)).toBe('J');
  });
});
