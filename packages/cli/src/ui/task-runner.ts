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
