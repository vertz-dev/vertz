// @vertz/ui-native — Native desktop renderer for Vertz
// Renders to GPU surface via FFI, no WebView needed.

// App utilities
export { createNotesStore, type Note, type NotesStore } from './app/notes-store';
export { buildNotesUI, type NotesUICallbacks } from './app/notes-ui-builder';
export { rgbaToHex } from './css/color-utils';
// CSS / Token resolver
export {
  createNativeTokenResolver,
  defaultDarkTheme,
  type NativeStyleMap,
  type NativeTheme,
  type NativeTokenResolver,
  oklchToRgba,
  type RGBA,
} from './css/native-token-resolver';
// Input system
export { createEventSystem, type EventSystem } from './input/event-system';
export { hitTest } from './input/hit-test';
export { createInputPoller, type InputPoller } from './input/input-poller';
export { type ComputedLayout, computeLayout } from './layout/layout';
export { createNativeAdapter } from './native-adapter';
export { NativeElement, NativeTextNode } from './native-element';
// GL constants
export { GL_COLOR_BUFFER_BIT, type GLBindings, loadGL } from './render/gl-ffi';
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

// Text rendering
export { createTextRenderer } from './text/text-renderer';
// GLFW
export { loadGLFW } from './window/glfw-ffi';
export {
  createNativeWindow,
  type NativeWindow,
  type NativeWindowOptions,
} from './window/native-window';
