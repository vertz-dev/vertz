import { signal } from '@vertz/ui';
import { isInteractive } from '../interactive';
import { __append, __child, __element, __staticText } from '../internals';
import { symbols } from '../theme';
import type { TuiElement } from '../tui-element';

export type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface TaskConfig {
  label: string;
  run: () => unknown | Promise<unknown>;
}

export interface TaskResult {
  label: string;
  status: TaskStatus;
  value?: unknown;
  error?: Error;
  duration: number;
}

export interface TaskRunnerConfig {
  tasks: TaskConfig[];
}

export interface TaskRunnerHandle {
  run(): Promise<TaskResult[]>;
  component(): TuiElement;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function write(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function TaskRunner(config: TaskRunnerConfig): TaskRunnerHandle {
  const taskStates = config.tasks.map(() =>
    signal<{ status: TaskStatus; duration: number; error?: Error }>({
      status: 'pending',
      duration: 0,
    }),
  );

  async function run(): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const ci = !isInteractive();
    let failed = false;

    for (const [i, task] of config.tasks.entries()) {
      const state = taskStates[i];
      if (!state) continue;

      if (failed) {
        state.value = { status: 'skipped', duration: 0 };
        results.push({ label: task.label, status: 'skipped', duration: 0 });
        if (ci) write(`${symbols.dash} ${task.label} (skipped)`);
        continue;
      }

      state.value = { status: 'running', duration: 0 };
      if (ci) write(`${symbols.pointer} ${task.label}...`);

      const start = performance.now();
      try {
        const value = await task.run();
        const duration = performance.now() - start;
        state.value = { status: 'success', duration };
        results.push({ label: task.label, status: 'success', value, duration });
        if (ci) write(`${symbols.success} ${task.label} (${formatDuration(duration)})`);
      } catch (err) {
        const duration = performance.now() - start;
        const error = err instanceof Error ? err : new Error(String(err));
        state.value = { status: 'error', duration, error };
        results.push({ label: task.label, status: 'error', error, duration });
        if (ci) write(`${symbols.error} ${task.label} — ${error.message}`);
        failed = true;
      }
    }

    return results;
  }

  function component(): TuiElement {
    const box = __element('Box', 'direction', 'column');

    for (const [i, task] of config.tasks.entries()) {
      const state = taskStates[i];
      if (!state) continue;

      const row = __element('Box', 'direction', 'row', 'gap', 1);

      // Status indicator (reactive)
      const statusEl = __element('Text');
      __append(
        statusEl,
        __child(() => {
          const s = state.value;
          switch (s.status) {
            case 'pending':
              return symbols.dash;
            case 'success':
              return symbols.success;
            case 'error':
              return symbols.error;
            case 'skipped':
              return symbols.dash;
            default:
              return '';
          }
        }),
      );

      // Label
      const labelEl = __element('Text');
      __append(labelEl, __staticText(task.label));

      // Duration (reactive, only shown when complete)
      const durationEl = __element('Text', 'color', 'gray');
      __append(
        durationEl,
        __child(() => {
          const s = state.value;
          if (s.status === 'success') return formatDuration(s.duration);
          if (s.status === 'error') return s.error?.message ?? 'failed';
          return '';
        }),
      );

      __append(row, statusEl);
      __append(row, labelEl);
      __append(row, durationEl);
      __append(box, row);
    }

    return box;
  }

  return { run, component };
}
