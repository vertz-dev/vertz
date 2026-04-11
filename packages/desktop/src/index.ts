export * as app from './app.js';
export * as appWindow from './window.js';
export * as clipboard from './clipboard.js';
export * as dialog from './dialog.js';
export * as fs from './fs.js';
export * as ipc from './ipc.js';
export * as shell from './shell.js';
export type {
  ConfirmDialogOptions,
  CreateDirOptions,
  DesktopError,
  DesktopErrorCode,
  DirEntry,
  FileFilter,
  FileStat,
  IpcCallOptions,
  MessageDialogOptions,
  OpenDialogOptions,
  SaveDialogOptions,
  ShellOutput,
  WindowSize,
} from './types.js';
export type { ChildProcess, ExecuteOptions, SpawnOptions } from './shell.js';
export type {
  DesktopPermissionConfig,
  IpcCapabilityGroup,
  IpcMethodString,
  IpcPermission,
} from './permissions.js';
