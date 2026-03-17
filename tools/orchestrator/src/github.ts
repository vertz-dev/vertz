/**
 * GitHub API helpers using `gh` CLI.
 */

const REPO = 'vertz-dev/vertz';
const AUTHOR = 'viniciusdacal';

export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
}

const PRIORITY_ORDER: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function priorityOf(issue: Issue): number {
  for (const label of issue.labels) {
    if (label.name in PRIORITY_ORDER) return PRIORITY_ORDER[label.name];
  }
  return 99; // no priority label → lowest
}

/**
 * Fetch open issues by the user, excluding in-progress and blocked.
 */
export async function fetchEligibleIssues(): Promise<Issue[]> {
  const proc = Bun.spawn(
    [
      'gh', 'issue', 'list',
      '--repo', REPO,
      '--author', AUTHOR,
      '--state', 'open',
      '--json', 'number,title,labels,body',
      '--limit', '50',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`gh issue list failed: ${err}`);
  }

  const issues: Issue[] = JSON.parse(text);
  return issues
    .filter((issue) => {
      const names = new Set(issue.labels.map((l) => l.name));
      return !names.has('in-progress') && !names.has('blocked');
    })
    .sort((a, b) => priorityOf(a) - priorityOf(b));
}

/**
 * Fetch a single issue by number.
 */
export async function fetchIssue(number: number): Promise<Issue> {
  const proc = Bun.spawn(
    [
      'gh', 'issue', 'view', String(number),
      '--repo', REPO,
      '--json', 'number,title,labels,body',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`gh issue view #${number} failed: ${err}`);
  }

  return JSON.parse(text);
}

/**
 * Add a label to an issue.
 */
export async function addLabel(number: number, label: string): Promise<void> {
  const proc = Bun.spawn(
    ['gh', 'issue', 'edit', String(number), '--repo', REPO, '--add-label', label],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await proc.exited;
}

/**
 * Remove a label from an issue.
 */
export async function removeLabel(number: number, label: string): Promise<void> {
  const proc = Bun.spawn(
    ['gh', 'issue', 'edit', String(number), '--repo', REPO, '--remove-label', label],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await proc.exited;
}
