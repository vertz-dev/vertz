import { tui } from './app';
import { Confirm } from './components/Confirm';
import { MultiSelect } from './components/MultiSelect';
import { PasswordInput } from './components/PasswordInput';
import type { SelectOption } from './components/Select';
import { Select } from './components/Select';
import { Spinner } from './components/Spinner';
import { TextInput } from './components/TextInput';
import { __append, __element, __staticText } from './internals';
import { symbols } from './theme';
import type { TuiElement } from './tui-element';

interface TextPromptConfig {
  message: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
}

interface SelectPromptConfig<T> {
  message: string;
  options: SelectOption<T>[];
}

interface MultiSelectPromptConfig<T> {
  message: string;
  options: SelectOption<T>[];
  defaultValue?: T[];
}

interface ConfirmPromptConfig {
  message: string;
}

interface PasswordPromptConfig {
  message: string;
  placeholder?: string;
}

interface SpinnerHandle {
  start(message: string): void;
  stop(message: string): void;
}

interface LogMethods {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
}

export interface PromptAPI {
  text(config: TextPromptConfig): Promise<string>;
  select<T>(config: SelectPromptConfig<T>): Promise<T>;
  multiSelect<T>(config: MultiSelectPromptConfig<T>): Promise<T[]>;
  confirm(config: ConfirmPromptConfig): Promise<boolean>;
  password(config: PasswordPromptConfig): Promise<string>;
  spinner(): SpinnerHandle;
  intro(title: string): void;
  outro(message: string): void;
  log: LogMethods;
}

function write(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** Imperative prompt API — sugar built on top of persistent tree components. */
export const prompt: PromptAPI = {
  text(config: TextPromptConfig): Promise<string> {
    return new Promise((resolve) => {
      let handle: ReturnType<typeof tui.mount> | null = null;
      function App(): TuiElement {
        const box = __element('Box', 'direction', 'column');
        const header = __element('Text', 'bold', true);
        __append(header, __staticText(config.message));
        __append(box, header);
        __append(
          box,
          TextInput({
            placeholder: config.placeholder,
            onSubmit: (value: string) => {
              if (config.validate) {
                const error = config.validate(value);
                if (error) return;
              }
              handle?.unmount();
              resolve(value);
            },
          }),
        );
        return box;
      }
      handle = tui.mount(App);
    });
  },

  select<T>(config: SelectPromptConfig<T>): Promise<T> {
    return new Promise((resolve) => {
      let handle: ReturnType<typeof tui.mount> | null = null;
      function App(): TuiElement {
        return Select({
          message: config.message,
          options: config.options,
          onSubmit: (value: T) => {
            handle?.unmount();
            resolve(value);
          },
        });
      }
      handle = tui.mount(App);
    });
  },

  multiSelect<T>(config: MultiSelectPromptConfig<T>): Promise<T[]> {
    return new Promise((resolve) => {
      let handle: ReturnType<typeof tui.mount> | null = null;
      function App(): TuiElement {
        return MultiSelect({
          message: config.message,
          options: config.options,
          defaultValue: config.defaultValue,
          onSubmit: (values: T[]) => {
            handle?.unmount();
            resolve(values);
          },
        });
      }
      handle = tui.mount(App);
    });
  },

  confirm(config: ConfirmPromptConfig): Promise<boolean> {
    return new Promise((resolve) => {
      let handle: ReturnType<typeof tui.mount> | null = null;
      function App(): TuiElement {
        return Confirm({
          message: config.message,
          onSubmit: (value: boolean) => {
            handle?.unmount();
            resolve(value);
          },
        });
      }
      handle = tui.mount(App);
    });
  },

  password(config: PasswordPromptConfig): Promise<string> {
    return new Promise((resolve) => {
      let handle: ReturnType<typeof tui.mount> | null = null;
      function App(): TuiElement {
        const box = __element('Box', 'direction', 'column');
        const header = __element('Text', 'bold', true);
        __append(header, __staticText(config.message));
        __append(box, header);
        __append(
          box,
          PasswordInput({
            placeholder: config.placeholder,
            onSubmit: (value: string) => {
              handle?.unmount();
              resolve(value);
            },
          }),
        );
        return box;
      }
      handle = tui.mount(App);
    });
  },

  spinner(): SpinnerHandle {
    let handle: ReturnType<typeof tui.mount> | null = null;
    return {
      start(message: string) {
        function App(): TuiElement {
          return Spinner({ label: message });
        }
        handle = tui.mount(App);
      },
      stop(message: string) {
        handle?.unmount();
        handle = null;
        write(message);
      },
    };
  },

  intro(title: string): void {
    write('');
    write(`  ${title}`);
    write('');
  },

  outro(message: string): void {
    write('');
    write(`  ${message}`);
    write('');
  },

  log: {
    info(message: string) {
      write(`${symbols.info} ${message}`);
    },
    warn(message: string) {
      write(`${symbols.warning} ${message}`);
    },
    error(message: string) {
      write(`${symbols.error} ${message}`);
    },
    success(message: string) {
      write(`${symbols.success} ${message}`);
    },
  },
};
