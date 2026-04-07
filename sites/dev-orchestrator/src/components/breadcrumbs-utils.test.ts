import { describe, expect, it } from 'vitest';
import { buildBreadcrumbs } from './breadcrumbs-utils';

describe('buildBreadcrumbs', () => {
  it('returns only Dashboard for root path', () => {
    expect(buildBreadcrumbs('/')).toEqual([{ label: 'Dashboard', href: '/' }]);
  });

  it('returns Dashboard > Workflow for workflow detail', () => {
    expect(buildBreadcrumbs('/workflows/wf-1')).toEqual([
      { label: 'Dashboard', href: '/' },
      { label: 'Workflow wf-1', href: '/workflows/wf-1' },
    ]);
  });

  it('returns Dashboard > Workflow > Step for step inspector', () => {
    expect(buildBreadcrumbs('/workflows/wf-1/steps/plan')).toEqual([
      { label: 'Dashboard', href: '/' },
      { label: 'Workflow wf-1', href: '/workflows/wf-1' },
      { label: 'Step: plan', href: '/workflows/wf-1/steps/plan' },
    ]);
  });

  it('returns Dashboard > Definitions for definitions list', () => {
    expect(buildBreadcrumbs('/definitions')).toEqual([
      { label: 'Dashboard', href: '/' },
      { label: 'Definitions', href: '/definitions' },
    ]);
  });

  it('returns Dashboard > Definitions > name for definition detail', () => {
    expect(buildBreadcrumbs('/definitions/feature')).toEqual([
      { label: 'Dashboard', href: '/' },
      { label: 'Definitions', href: '/definitions' },
      { label: 'feature', href: '/definitions/feature' },
    ]);
  });

  it('returns Dashboard > Agents for agents list', () => {
    expect(buildBreadcrumbs('/agents')).toEqual([
      { label: 'Dashboard', href: '/' },
      { label: 'Agents', href: '/agents' },
    ]);
  });

  it('returns Dashboard > Agents > name for agent detail', () => {
    expect(buildBreadcrumbs('/agents/planner')).toEqual([
      { label: 'Dashboard', href: '/' },
      { label: 'Agents', href: '/agents' },
      { label: 'planner', href: '/agents/planner' },
    ]);
  });
});
