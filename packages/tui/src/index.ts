// App lifecycle

export type { Computed, DisposeFn, ReadonlySignal, Signal } from '@vertz/ui';
// Reactivity re-exports from @vertz/ui
export {
  batch,
  computed,
  createContext,
  onCleanup,
  onMount,
  signal,
  useContext,
} from '@vertz/ui';
export type { TuiHandle, TuiMountOptions } from './app';
export { tui } from './app';
export type { BoxProps } from './components/Box';
// Layout components
export { Box } from './components/Box';
export type { ConfirmProps } from './components/Confirm';
export { Confirm } from './components/Confirm';
export type { LogProps } from './components/Log';
export { Log } from './components/Log';
export type { MultiSelectProps } from './components/MultiSelect';
export { MultiSelect } from './components/MultiSelect';
export type { PasswordInputProps } from './components/PasswordInput';
export { PasswordInput } from './components/PasswordInput';
export type { ProgressBarProps } from './components/ProgressBar';
export { ProgressBar } from './components/ProgressBar';
export type { SelectOption, SelectProps } from './components/Select';
export { Select } from './components/Select';
export { Spacer } from './components/Spacer';
export type { SpinnerProps } from './components/Spinner';
export { Spinner } from './components/Spinner';
export type { TableColumn, TableProps } from './components/Table';
// Data display
export { Table } from './components/Table';
export type { TextProps } from './components/Text';
export { Text } from './components/Text';
export type { TextInputProps } from './components/TextInput';
// Interactive components
export { TextInput } from './components/TextInput';
export { FocusContext, useFocus } from './focus/focus-manager';
export { useKeyboard } from './input/hooks';
// Input
export type { KeyEvent } from './input/key-parser';
export type { KeyMap } from './input/match';
export { match } from './input/match';
// Interactive detection
export { isInteractive, NonInteractiveError } from './interactive';
// Types
export type { Color } from './jsx-runtime/index';
export type { TaskGroup, TaskHandle, TaskRunner } from './legacy';
// Legacy API (deprecated — will be removed in future version)
export { createTaskRunner, Message, SelectList, Task, TaskList } from './legacy';
// Prompt API
export type {
  ConfirmPromptConfig,
  MultiSelectPromptConfig,
  PasswordPromptConfig,
  PromptAPI,
  SelectPromptConfig,
  TextPromptConfig,
} from './prompt';
export { prompt } from './prompt';
// Render to string
export type { RenderToStringOptions } from './render-to-string';
export { renderToString } from './render-to-string';
// Theme
export { colors, symbols } from './theme';
