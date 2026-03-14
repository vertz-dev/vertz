import { entity, rules, UnauthorizedException } from '@vertz/server';
import { commentsModel } from '../schema';

export const comments = entity('comments', {
  model: commentsModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.all(rules.authenticated(), rules.where({ authorId: rules.user.id })),
    delete: rules.all(rules.authenticated(), rules.where({ authorId: rules.user.id })),
  },
  before: {
    create: (data, ctx) => {
      if (!ctx.userId) throw new UnauthorizedException('Authenticated user required');
      return { ...data, authorId: ctx.userId };
    },
  },
});
