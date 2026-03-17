import { s } from '@vertz/schema';
import { updateIssuesInputSchema } from '#generated/schemas';

// Extend the generated update schema — title is required in the edit form
export const editIssueSchema = updateIssuesInputSchema.extend({
  title: s.string().min(1),
});

export type EditIssueInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
};
