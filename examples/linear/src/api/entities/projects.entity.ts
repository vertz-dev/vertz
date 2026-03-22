import { entity, rules, UnauthorizedException } from '@vertz/server';
import { projectsModel } from '../schema';

export const projects = entity('projects', {
  model: projectsModel,
  access: {
    list: rules.entitlement('project:read'),
    get: rules.entitlement('project:read'),
    create: rules.entitlement('project:create'),
    update: rules.all(
      rules.entitlement('project:update'),
      rules.where({ createdBy: rules.user.id }),
    ),
    delete: rules.entitlement('project:delete'),
  },
  before: {
    create: (data, ctx) => {
      if (!ctx.userId) throw new UnauthorizedException('Authenticated user required');
      return { ...data, createdBy: ctx.userId };
    },
  },
});
