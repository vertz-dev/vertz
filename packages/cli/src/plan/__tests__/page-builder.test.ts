import { describe, expect, it } from 'bun:test';
import { buildPagePlan } from '../page-builder';

describe('buildPagePlan', () => {
  it('generates a basic page component', () => {
    const plan = buildPagePlan({ name: 'dashboard', crud: false });

    const pageOp = plan.operations.find((op) => op.path.includes('pages'));
    expect(pageOp).toBeDefined();
    expect(pageOp!.type).toBe('create');
    expect(pageOp!.content).toContain('DashboardPage');
    expect(pageOp!.content).toContain('export function');
  });

  it('generates a CRUD page when --crud is set', () => {
    const plan = buildPagePlan({ name: 'posts', crud: true, forEntity: 'posts' });

    const pageOp = plan.operations.find((op) => op.path.includes('pages'));
    expect(pageOp!.content).toContain('query');
    expect(pageOp!.content).toContain('api.posts');
  });

  it('generates router modification', () => {
    const plan = buildPagePlan({ name: 'dashboard', crud: false });

    const routerOp = plan.operations.find((op) => op.path.includes('router'));
    expect(routerOp).toBeDefined();
    expect(routerOp!.type).toBe('modify');
    expect(routerOp!.description).toContain('dashboard');
  });

  it('uses PascalCase for component name', () => {
    const plan = buildPagePlan({ name: 'user-settings', crud: false });

    const pageOp = plan.operations.find((op) => op.path.includes('pages'));
    expect(pageOp!.content).toContain('UserSettingsPage');
  });

  it('creates file at correct path', () => {
    const plan = buildPagePlan({ name: 'posts', crud: false });

    const pageOp = plan.operations.find((op) => op.path.includes('pages'));
    expect(pageOp!.path).toBe('src/pages/posts.tsx');
  });
});
