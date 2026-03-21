import { entity, rules, UnauthorizedException } from '@vertz/server';
import { issuesModel } from '../schema';

export const issues = entity('issues', {
  model: issuesModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.authenticated(),
    delete: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
  },
  expose: {
    select: {
      id: true,
      projectId: true,
      number: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      assigneeId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
    allowWhere: { projectId: true, status: true, priority: true, assigneeId: true },
    allowOrderBy: { number: true, createdAt: true, updatedAt: true, priority: true },
    include: {
      project: { select: { id: true, name: true, key: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      comments: {
        select: { id: true, body: true, authorId: true, createdAt: true },
        allowOrderBy: { createdAt: true },
        maxLimit: 100,
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      labels: {
        select: { id: true, name: true, color: true },
      },
    },
  },
  before: {
    create: async (data, ctx) => {
      if (!ctx.userId) throw new UnauthorizedException('Authenticated user required');
      // Auto-increment issue number per project.
      // Note: no concurrent-safety guarantee — acceptable for single-user example.
      const existing = await ctx.entity.list({
        where: { projectId: data.projectId },
        orderBy: { number: 'desc' },
        limit: 1,
      });
      const nextNumber = existing.items.length > 0 ? existing.items[0].number + 1 : 1;
      return { ...data, number: nextNumber, createdBy: ctx.userId };
    },
  },
});
