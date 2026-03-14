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

export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}
