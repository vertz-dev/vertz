/** Namespace-level capability groups for desktop IPC permissions. */
export type IpcCapabilityGroup =
  | 'fs:read'
  | 'fs:write'
  | 'fs:all'
  | 'shell:execute'
  | 'shell:all'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'clipboard:all'
  | 'dialog:all'
  | 'appWindow:all'
  | 'app:all';

/** Individual IPC method string (same as wire protocol). */
export type IpcMethodString =
  | 'fs.readTextFile'
  | 'fs.writeTextFile'
  | 'fs.readDir'
  | 'fs.exists'
  | 'fs.stat'
  | 'fs.remove'
  | 'fs.rename'
  | 'fs.createDir'
  | 'shell.execute'
  | 'clipboard.readText'
  | 'clipboard.writeText'
  | 'dialog.open'
  | 'dialog.save'
  | 'dialog.confirm'
  | 'dialog.message'
  | 'appWindow.setTitle'
  | 'appWindow.setSize'
  | 'appWindow.setFullscreen'
  | 'appWindow.innerSize'
  | 'appWindow.minimize'
  | 'appWindow.close'
  | 'app.dataDir'
  | 'app.cacheDir'
  | 'app.version';

/** A permission entry is either a capability group or an individual method. */
export type IpcPermission = IpcCapabilityGroup | IpcMethodString;

/** Desktop configuration in .vertzrc. */
export interface DesktopPermissionConfig {
  permissions: IpcPermission[];
}
