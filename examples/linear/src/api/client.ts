/**
 * Client SDK for the Linear clone API.
 *
 * Uses FetchClient from @vertz/fetch for proper URL resolution and SSR
 * fetch interception. In a real app, this entire file would be generated
 * by @vertz/codegen from entity definitions.
 */

import { ok } from '@vertz/errors';
import { createDescriptor, FetchClient } from '@vertz/fetch';
import type {
  Comment,
  CreateCommentBody,
  CreateIssueBody,
  CreateProjectBody,
  Issue,
  ListResponse,
  Project,
  User,
} from '../lib/types';

const client = new FetchClient({ baseURL: '/api' });

export const projectApi = {
  list: Object.assign(
    () =>
      createDescriptor<ListResponse<Project>>('GET', '/projects', () =>
        client.get<ListResponse<Project>>('/projects'),
      ),
    { url: '/api/projects', method: 'GET' as const },
  ),

  get: Object.assign(
    (id: string) =>
      createDescriptor<Project>('GET', `/projects/${id}`, () =>
        client.get<Project>(`/projects/${id}`),
      ),
    { url: '/api/projects/:id', method: 'GET' as const },
  ),

  create: Object.assign(
    async (body: CreateProjectBody) => {
      const res = await client.post<Project>('/projects', body);
      if (!res.ok) return res;
      return ok(res.data.data);
    },
    { url: '/api/projects', method: 'POST' as const },
  ),

  update: async (id: string, body: Partial<CreateProjectBody>) => {
    const res = await client.patch<Project>(`/projects/${id}`, body);
    if (!res.ok) return res;
    return ok(res.data.data);
  },

  delete: async (id: string) => {
    const res = await client.delete<void>(`/projects/${id}`);
    if (!res.ok) return res;
    return ok(undefined);
  },
};

export const issueApi = {
  list: Object.assign(
    (projectId: string) =>
      createDescriptor<ListResponse<Issue>>(
        'GET',
        '/issues',
        () => client.get<ListResponse<Issue>>('/issues', { query: { projectId } }),
        { projectId },
      ),
    { url: '/api/issues', method: 'GET' as const },
  ),

  get: Object.assign(
    (id: string) =>
      createDescriptor<Issue>('GET', `/issues/${id}`, () => client.get<Issue>(`/issues/${id}`)),
    { url: '/api/issues/:id', method: 'GET' as const },
  ),

  create: Object.assign(
    async (body: CreateIssueBody) => {
      const res = await client.post<Issue>('/issues', body);
      if (!res.ok) return res;
      return ok(res.data.data);
    },
    { url: '/api/issues', method: 'POST' as const },
  ),

  update: Object.assign(
    async (id: string, body: Partial<Omit<CreateIssueBody, 'projectId'>>) => {
      const res = await client.patch<Issue>(`/issues/${id}`, body);
      if (!res.ok) return res;
      return ok(res.data.data);
    },
    { url: '/api/issues/:id', method: 'PATCH' as const },
  ),

  delete: async (id: string) => {
    const res = await client.delete<void>(`/issues/${id}`);
    if (!res.ok) return res;
    return ok(undefined);
  },
};

export const commentApi = {
  list: Object.assign(
    (issueId: string) =>
      createDescriptor<ListResponse<Comment>>(
        'GET',
        '/comments',
        () => client.get<ListResponse<Comment>>('/comments', { query: { issueId } }),
        { issueId },
      ),
    { url: '/api/comments', method: 'GET' as const },
  ),

  create: Object.assign(
    async (body: CreateCommentBody) => {
      const res = await client.post<Comment>('/comments', body);
      if (!res.ok) return res;
      return ok(res.data.data);
    },
    { url: '/api/comments', method: 'POST' as const },
  ),

  delete: async (id: string) => {
    const res = await client.delete<void>(`/comments/${id}`);
    if (!res.ok) return res;
    return ok(undefined);
  },
};

export const userApi = {
  list: Object.assign(
    () =>
      createDescriptor<ListResponse<User>>('GET', '/users', () =>
        client.get<ListResponse<User>>('/users'),
      ),
    { url: '/api/users', method: 'GET' as const },
  ),
};
