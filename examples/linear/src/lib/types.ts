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

export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}
