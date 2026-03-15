/**
 * Hand-written types for the Linear clone UI.
 *
 * These provide narrower types than @vertz/codegen generates (enum unions
 * instead of `string`, `string | null` instead of `unknown`). Once codegen
 * supports nullable and enum inference, these can be replaced by generated types.
 */

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectBody {
  name: string;
  key: string;
  description?: string;
}

export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
export type IssuePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface Issue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueBody {
  projectId: string;
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  body: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommentBody {
  issueId: string;
  body: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}
