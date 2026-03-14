import { entity, rules, UnauthorizedException } from '@vertz/server';
import { projectsModel } from '../schema';

export const projects = entity('projects', {
  model: projectsModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
    delete: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
  },
  before: {
    create: (data, ctx) => {
      if (!ctx.userId) throw new UnauthorizedException('Authenticated user required');
      return { ...data, createdBy: ctx.userId };
    },
  },
});
