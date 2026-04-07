// Type-level tests for generated SDK query types.
// Verifies compile-time guarantees that invalid usage is rejected.

// ── Sample generated types (matching generator output for a task entity) ──

interface TaskResponse {
  id: string;
  title: string;
  status: string;
  priority: number;
  createdAt: string;
}

type TaskFields = keyof TaskResponse;

interface TaskWhereInput {
  status?: string | { eq?: string; neq?: string; in?: string[]; like?: string; contains?: string };
  priority?:
    | number
    | {
        eq?: number;
        neq?: number;
        gt?: number;
        lt?: number;
        gte?: number;
        lte?: number;
        in?: number[];
      };
}

interface TaskOrderByInput {
  createdAt?: 'asc' | 'desc';
  priority?: 'asc' | 'desc';
}

interface TaskIncludeInput {
  assignee?: true | { select?: { id?: true; name?: true } };
}

interface TaskListQuery {
  select?: { [F in TaskFields]?: true };
  where?: TaskWhereInput;
  orderBy?: TaskOrderByInput;
  include?: TaskIncludeInput;
  limit?: number;
  after?: string;
}

interface TaskGetQuery {
  select?: { [F in TaskFields]?: true };
  include?: TaskIncludeInput;
}

// ── Simulate SDK method signatures ──

declare function list(query?: TaskListQuery): void;
declare function get(id: string, options?: TaskGetQuery): void;

// ── Positive cases (must compile) ──

list();
list({ select: { id: true, title: true } });
list({ where: { status: 'active' } });
list({ where: { status: { in: ['a', 'b'] } } });
list({ where: { priority: { gte: 3 } } });
list({ orderBy: { createdAt: 'desc' } });
list({ limit: 25 });
list({ after: 'cursor_abc' });
list({ include: { assignee: true } });
list({ include: { assignee: { select: { id: true } } } });
get('1');
get('1', { select: { id: true } });
get('1', { include: { assignee: true } });

// ── Negative cases (must fail) ──

// @ts-expect-error — unknown key on list query
list({ foo: 'bar' });
// @ts-expect-error — field not in allowWhere
list({ where: { nonExistent: 1 } });
// @ts-expect-error — field not in allowOrderBy
list({ orderBy: { title: 'desc' } });
// @ts-expect-error — invalid order direction
list({ orderBy: { createdAt: 'up' } });
// @ts-expect-error — field not in response select
list({ select: { secret: true } });
// @ts-expect-error — relation not in include
list({ include: { nonExistent: true } });
// @ts-expect-error — limit must be number
list({ limit: 'not-a-number' });
// @ts-expect-error — get doesn't have orderBy
get('1', { orderBy: { createdAt: 'desc' } });
// @ts-expect-error — get doesn't have where
get('1', { where: { status: 'active' } });
// @ts-expect-error — get doesn't have limit
get('1', { limit: 25 });
