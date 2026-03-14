// @vertz/ui-native — Native desktop renderer for Vertz
// Renders to GPU surface via FFI, no WebView needed.

export { type ComputedLayout, computeLayout } from './layout/layout';
export { createNativeAdapter } from './native-adapter';
export { NativeElement, NativeTextNode } from './native-element';
export { type GLBindings, loadGL } from './render/gl-ffi';
export {
  createGLRenderer,
  type GLRenderer,
  type RectVertex,
} from './render/gl-renderer';
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
