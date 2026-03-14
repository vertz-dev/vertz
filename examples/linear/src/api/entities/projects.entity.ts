import { entity, rules } from '@vertz/server';
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
    // access: rules.authenticated() guarantees userId is non-null
    create: (data, ctx) => ({ ...data, createdBy: ctx.userId ?? '' }),
  },
});
