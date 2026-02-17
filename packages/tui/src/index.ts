import { batch, computed, effect, type Signal, signal } from '@vertz/ui';

export type { Signal };

// Terminal output - simple string-based rendering
type RenderFn = () => string;

interface Renderable {
  render: RenderFn;
  dispose?: () => void;
}

// Global terminal output buffer
let terminalBuffer: string[] = [];
let rootComponent: Renderable | null = null;

function clearBuffer(): void {
  terminalBuffer = [];
}

function appendToBuffer(text: string): void {
  terminalBuffer.push(text);
}

function getBuffer(): string {
  return terminalBuffer.join('\n');
}

// Render function to render the component tree
function render(component: Renderable): string {
  clearBuffer();
  rootComponent = component;
  const output = component.render();
  appendToBuffer(output);
  return getBuffer();
}

// Re-render root component
function reRender(): string {
  if (rootComponent) {
    return render(rootComponent);
  }
  return '';
}

// Re-export signals for external use
export { signal, computed, effect, batch };

/**
 * Creates a reactive TUI component that auto-updates when signals change.
 * Returns a render function and the component instance.
 */
export function createComponent<R extends Renderable>(
  factory: () => R,
): {
  render: () => string;
  instance: R;
  update: (factory: () => R) => void;
} {
  let instance = factory();

  // Set up effect to track signal dependencies
  effect(() => {
    // Reading instance.render() subscribes to all signals used inside
    instance.render();
  });

  return {
    render: () => {
      return instance.render();
    },
    instance,
    // Allow updating the instance
    update(factory: () => R) {
      if (instance.dispose) {
        instance.dispose();
      }
      instance = factory();
    },
  };
}

// Symbol and color utilities
export const symbols = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
  arrow: '\u279C',
  pointer: '\u276F',
  bullet: '\u25CF',
  dash: '\u2500',
} as const;

export const colors = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'cyan',
  dim: 'gray',
} as const;

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

type MessageType = 'info' | 'error' | 'warning' | 'success';

interface MessageConfig {
  type: MessageType;
  children: () => string;
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

      // Apply color based on status
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

export function TaskList({ title, tasks }: TaskListConfig): Renderable {
  return {
    render() {
      const titleText = typeof title === 'function' ? title() : title;
      const taskList = tasks.value;

      const lines: string[] = [`\x1b[1m${titleText}\x1b[0m`]; // bold

      for (const task of taskList) {
        const taskStatus: TaskStatus = task.status;
        const icon = iconMap[taskStatus];
        let line = `${icon} ${task.name}`;
        if (task.detail) {
          line += ` ${task.detail}`;
        }

        // Apply color based on status
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

// Task runner interfaces
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

// Task runner implementation using signals
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

// Export render helper
export const tui: {
  render: typeof render;
  reRender: typeof reRender;
  getBuffer: typeof getBuffer;
  clearBuffer: typeof clearBuffer;
} = {
  render: render,
  reRender: reRender,
  getBuffer: getBuffer,
  clearBuffer: clearBuffer,
};
