// ── Filesystem types ──

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDir: boolean;
}

export interface FileStat {
  size: number;
  isFile: boolean;
  isDir: boolean;
  /** Unix timestamp in milliseconds. */
  modified: number;
  /** Unix timestamp in milliseconds. */
  created: number;
}

export interface CreateDirOptions {
  recursive?: boolean;
}

// ── Shell types ──

export interface ShellOutput {
  /** Exit code. 0 = success. Non-zero = command ran but failed. */
  code: number;
  stdout: string;
  stderr: string;
}

// ── Dialog types ──

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  filters?: FileFilter[];
  defaultPath?: string;
  multiple?: boolean;
  directory?: boolean;
  title?: string;
}

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: FileFilter[];
  title?: string;
}

export interface ConfirmDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
}

export interface MessageDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
}

// ── Window types ──

export interface WindowSize {
  width: number;
  height: number;
}

// ── Error types ──

export type DesktopErrorCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'IO_ERROR'
  | 'INVALID_PATH'
  | 'TIMEOUT'
  | 'METHOD_NOT_FOUND'
  | 'WINDOW_CLOSED'
  | 'EXECUTION_FAILED'
  | 'CANCELLED';

export interface DesktopError {
  code: DesktopErrorCode;
  message: string;
}

// ── IPC options ──

export interface IpcCallOptions {
  timeout?: number;
}
