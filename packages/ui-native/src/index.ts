// @vertz/ui-native — Native desktop renderer for Vertz
// Renders to GPU surface via FFI, no WebView needed.

export { createNativeAdapter } from './native-adapter';
export { NativeElement, NativeTextNode } from './native-element';
export {
  collectDrawCommands,
  type DrawCommand,
  parseColor,
  type RectCommand,
  type TextCommand,
} from './render/renderer';
export {
  createNativeWindow,
  type NativeWindow,
  type NativeWindowOptions,
} from './window/native-window';
