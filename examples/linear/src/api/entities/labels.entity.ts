import { entity, rules } from '@vertz/server';
import { labelsModel } from '../schema';

export const labels = entity('labels', {
  model: labelsModel,
  access: {
    list: rules.entitlement('project:read'),
    get: rules.entitlement('project:read'),
    create: rules.entitlement('project:update'),
    update: rules.entitlement('project:update'),
    delete: rules.entitlement('project:update'),
  },
});
