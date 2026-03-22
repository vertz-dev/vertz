import { entity, rules } from '@vertz/server';
import { issueLabelsModel } from '../schema';

export const issueLabels = entity('issue-labels', {
  model: issueLabelsModel,
  access: {
    list: rules.entitlement('issue:read'),
    get: rules.entitlement('issue:read'),
    create: rules.entitlement('issue:update'),
    delete: rules.entitlement('issue:update'),
  },
});
