import { entity, rules, UnauthorizedException } from '@vertz/server';
import { commentsModel } from '../schema';

export const comments = entity('comments', {
  model: commentsModel,
  access: {
    list: rules.entitlement('comment:read'),
    get: rules.entitlement('comment:read'),
    create: rules.entitlement('comment:create'),
    update: rules.all(
      rules.entitlement('comment:create'),
      rules.where({ authorId: rules.user.id }),
    ),
    delete: rules.all(
      rules.entitlement('comment:delete'),
      rules.where({ authorId: rules.user.id }),
    ),
  },
  expose: {
    select: {
      id: true,
      issueId: true,
      body: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
    },
    allowWhere: { issueId: true },
    allowOrderBy: { createdAt: true },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  before: {
    create: (data, ctx) => {
      if (!ctx.userId) throw new UnauthorizedException('Authenticated user required');
      return { ...data, authorId: ctx.userId };
    },
  },
});
