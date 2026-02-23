/**
 * Legacy API — deprecated.
 * Preserved for backwards compatibility with @vertz/cli.
 * Use the new JSX-based components instead.
 */

import type { Signal } from '@vertz/ui';
import { colors, symbols } from './theme';

// Simple color codes for terminal
const colorCodes: Record<string, (text: string) => string> = {
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  red: (t) => `\x1b[31m${t}\x1b[0m`,
  yellow: (t) => `\x1b[33m${t}\x1b[0m`,
  cyan: (t) => `\x1b[36m${t}\x1b[0m`,
  gray: (t) => `\x1b[90m${t}\x1b[0m`,
};

function applyColor(text: string, color: string): string {
  const fn = colorCodes[color];
  return fn ? fn(text) : text;
}

type RenderFn = () => string;

interface Renderable {
  render: RenderFn;
  dispose?: () => void;
}

type MessageType = 'info' | 'error' | 'warning' | 'success';

interface MessageConfig {
  type: MessageType;
  children: (() => string) | string;
}

const symbolMap: Record<MessageType, string> = {
  info: symbols.info,
  error: symbols.error,
  warning: symbols.warning,
  success: symbols.success,
};

const colorMap: Record<MessageType, string> = {
  info: colors.info,
  error: colors.error,
  warning: colors.warning,
  success: colors.success,
};

/** @deprecated Use `<Text>` with `symbols` instead. */
export function Message({ type, children }: MessageConfig): Renderable {
  return {
    render() {
      const symbol = symbolMap[type];
      const content = typeof children === 'function' ? children() : String(children);
      return applyColor(`${symbol} ${content}`, colorMap[type]);
    },
  };
}

interface Choice {
  label: string;
  value: string;
}

interface SelectListConfig {
  title: () => string;
  choices: () => readonly Choice[];
  selectedIndex: Signal<number>;
}

/** @deprecated Use `<Select>` instead. */
export function SelectList({ title, choices, selectedIndex }: SelectListConfig): Renderable {
  return {
    render() {
      const titleText = typeof title === 'function' ? title() : title;
      const choicesList = typeof choices === 'function' ? choices() : choices;
      const selected = selectedIndex.value;

      const lines: string[] = [titleText];

      for (let i = 0; i < choicesList.length; i++) {
        const choice = choicesList[i];
        if (!choice) continue;
        const prefix = i === selected ? symbols.pointer : ' ';
        lines.push(`${prefix} ${choice.label}`);
      }

      return lines.join('\n');
    },
  };
}

type TaskStatus = 'pending' | 'running' | 'done' | 'error';

interface TaskConfig {
  name: () => string;
  status: Signal<TaskStatus>;
  detail?: Signal<string | undefined>;
}

const iconMap: Record<TaskStatus, string> = {
  pending: symbols.dash,
  running: symbols.pointer,
  done: symbols.success,
  error: symbols.error,
};

/** @deprecated Use custom `<Box>` + `<Text>` + `<Spinner>` instead. */
export function Task({ name, status, detail }: TaskConfig): Renderable {
  return {
    render() {
      const nameText = typeof name === 'function' ? name() : name;
      const currentStatus: TaskStatus = status.value;
      const icon = iconMap[currentStatus];
      const detailText = detail?.value;

      let text = `${icon} ${nameText}`;
      if (detailText) {
        text += ` ${detailText}`;
      }

      if (currentStatus === 'done') {
        return applyColor(text, colors.success);
      } else if (currentStatus === 'error') {
        return applyColor(text, colors.error);
      } else if (currentStatus === 'running') {
        return applyColor(text, colors.info);
      }

      return text;
    },
  };
}

interface TaskItem {
  name: string;
  status: TaskStatus;
  detail?: string;
}

interface TaskListConfig {
  title: () => string;
  tasks: Signal<readonly TaskItem[]>;
}

/** @deprecated Use custom JSX components instead. */
export function TaskList({ title, tasks }: TaskListConfig): Renderable {
  return {
    render() {
      const titleText = typeof title === 'function' ? title() : title;
      const taskList = tasks.value;

      const lines: string[] = [`\x1b[1m${titleText}\x1b[0m`];

      for (const task of taskList) {
        const taskStatus: TaskStatus = task.status;
        const icon = iconMap[taskStatus];
        let line = `${icon} ${task.name}`;
        if (task.detail) {
          line += ` ${task.detail}`;
        }

        if (taskStatus === 'done') {
          line = applyColor(line, colors.success);
        } else if (taskStatus === 'error') {
          line = applyColor(line, colors.error);
        } else if (taskStatus === 'running') {
          line = applyColor(line, colors.info);
        }

        lines.push(line);
      }

      return lines.join('\n');
    },
  };
}

export interface TaskHandle {
  update(message: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
}

export interface TaskGroup {
  task(name: string, fn: (handle: TaskHandle) => Promise<void>): Promise<void>;
  dismiss(): void;
}

export interface TaskRunner {
  group(name: string): TaskGroup;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  cleanup(): void;
}

/** @deprecated Use `prompt.spinner()` or custom JSX instead. */
export function createTaskRunner(): TaskRunner {
  const messages: Array<{ type: string; message: string }> = [];

  return {
    group(_name: string): TaskGroup {
      return {
        async task(_name: string, fn: (handle: TaskHandle) => Promise<void>): Promise<void> {
          const handle: TaskHandle = {
            update() {},
            succeed() {},
            fail() {},
          };
          await fn(handle);
        },
        dismiss() {},
      };
    },
    info(message: string) {
      messages.push({ type: 'info', message });
    },
    warn(message: string) {
      messages.push({ type: 'warning', message });
    },
    error(message: string) {
      messages.push({ type: 'error', message });
    },
    success(message: string) {
      messages.push({ type: 'success', message });
    },
    cleanup() {},
  };
}
