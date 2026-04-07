/**
 * Deterministic sandbox file paths for workflow artifacts.
 *
 * All workflow steps share the same SandboxClient instance.
 * These path conventions let steps reference each other's output
 * by path instead of inlining full text into the conversation.
 */

const WORK_DIR = '/home/daytona/workspace';

export function planPath(issueNumber: number): string {
  return `${WORK_DIR}/plans/issue-${issueNumber}.md`;
}

export function reviewPath(
  issueNumber: number,
  type: 'dx' | 'product' | 'technical' | 'code',
): string {
  return `${WORK_DIR}/reviews/issue-${issueNumber}/${type}.md`;
}

export function implementationSummaryPath(issueNumber: number): string {
  return `${WORK_DIR}/reviews/issue-${issueNumber}/implementation-summary.md`;
}
