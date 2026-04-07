export interface ToolCallRecord {
  readonly name: string;
  readonly input: string;
  readonly output?: string;
  readonly duration?: number;
}

export interface ToolCallLogProps {
  readonly calls: readonly ToolCallRecord[];
}

export function formatToolDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

