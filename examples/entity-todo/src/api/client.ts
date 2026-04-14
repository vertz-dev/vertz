import { createClient } from '#generated';

export type * from '#generated/types';

/** Shape of a single Todo entity response. */
export interface TodosResponse {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export const api = createClient();
