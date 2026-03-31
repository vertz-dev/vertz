import type { PropDefinition } from '../types';

export const dialogStackProviderProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'unknown',
    default: '\u2014',
    description: 'The application tree that needs access to useDialogStack().',
  },
];

export const useDialogStackReturnProps: PropDefinition[] = [
  {
    name: 'open',
    type: '<TResult, TProps>(component, props) => Promise<DialogResult<TResult>>',
    default: '\u2014',
    description: 'Opens a dialog component and returns a promise that resolves when it closes.',
  },
  {
    name: 'size',
    type: 'number',
    default: '\u2014',
    description: 'The number of currently open dialogs in the stack.',
  },
  {
    name: 'closeAll',
    type: '() => void',
    default: '\u2014',
    description: 'Dismisses all open dialogs. Each resolves with { ok: false }.',
  },
];

export const dialogHandleProps: PropDefinition[] = [
  {
    name: 'close',
    type: '(result?: TResult) => void',
    default: '\u2014',
    description: 'Closes the dialog. The result is returned to the caller via the promise.',
  },
];
