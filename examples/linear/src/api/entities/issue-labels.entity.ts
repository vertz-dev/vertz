import { entity, rules } from '@vertz/server';
import { issueLabelsModel } from '../schema';

export const issueLabels = entity('issue-labels', {
  model: issueLabelsModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    delete: rules.authenticated(),
  },
});
