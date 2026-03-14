#!/usr/bin/env bun

/**
 * Native Notes App — Phase 8: Native macOS Text Inputs
 *
 * Full CRUD notes app rendered natively via OpenGL,
 * with native NSTextField overlays for text input.
 *
 * Features:
 * - In-memory notes store with create/delete
 * - NativeElement scene graph with Yoga flexbox layout
 * - FreeType text rendering via glyph atlas
 * - Mouse input: click to create/delete notes, hover feedback
 * - Design tokens: dark theme with oklch colors
 * - Native macOS NSTextField for text input (via Obj-C FFI)
 *
 * Run: bun packages/ui-native/examples/notes-app.ts
 */

import { createNotesStore } from '../src/app/notes-store';
import { buildNotesUI } from '../src/app/notes-ui-builder';
import { loadCocoa } from '../src/cocoa/cocoa-ffi';
import { createEventSystem } from '../src/input/event-system';
import { createInputPoller } from '../src/input/input-poller';
import { computeLayout } from '../src/layout/layout';
import { GL_COLOR_BUFFER_BIT, loadGL } from '../src/render/gl-ffi';
import { createGLRenderer } from '../src/render/gl-renderer';
import type { RectCommand } from '../src/render/renderer';
import { collectDrawCommands } from '../src/render/renderer';
import { createTextRenderer } from '../src/text/text-renderer';
import { loadGLFW } from '../src/window/glfw-ffi';
import { createNativeWindow } from '../src/window/native-window';

// --- Notes store ---

const store = createNotesStore();

// Seed with a couple of notes
store.create('Welcome to Vertz Notes', 'This app runs natively — no WebView!');
store.create('GPU Rendered', 'All UI is drawn with OpenGL + FreeType.');

// --- Create window ---

const FONT_PATH = '/System/Library/Fonts/Supplemental/Arial.ttf';

const win = createNativeWindow({
  title: 'Vertz Notes — Native (No WebView)',
  width: 700,
  height: 500,
});

const gl = loadGL();
const glfw = loadGLFW();
const rectRenderer = createGLRenderer(gl);
const textRenderer = createTextRenderer(gl, FONT_PATH, 16);

// --- Native text inputs (macOS NSTextField via Obj-C FFI) ---

const cocoa = loadCocoa();
const nsWindow = win.nsWindow;
const contentH = cocoa.contentHeight(nsWindow);

// Style helper: apply dark theme to a native text field
function styleInput(field: ReturnType<typeof cocoa.createTextField>, placeholder: string) {
  cocoa.setPlaceholder(field, placeholder);
  cocoa.setBordered(field, false);
  cocoa.setBgColor(field, 0.18, 0.18, 0.2, 1); // dark card-like bg
  cocoa.setTextColor(field, 0.95, 0.95, 0.95, 1); // near-white text
  cocoa.setFontSize(field, 14);
  cocoa.setCornerRadius(field, 6);
  cocoa.setBorderColor(field, 0.35, 0.35, 0.4, 1); // subtle border
}

// Create title and content inputs — positioned in macOS coords (bottom-left origin)
// We'll reposition them each frame based on layout
const titleInput = cocoa.createTextField(16, contentH - 100, 500, 28);
styleInput(titleInput, 'Note title...');
cocoa.addToWindow(nsWindow, titleInput);

const contentInput = cocoa.createTextField(16, contentH - 134, 500, 28);
styleInput(contentInput, 'Write something...');
cocoa.addToWindow(nsWindow, contentInput);

// --- Build UI ---

function rebuildUI() {
  return buildNotesUI(store.list(), {
    onCreate: () => {
      const title = cocoa.getText(titleInput);
      const content = cocoa.getText(contentInput);
      if (!title.trim()) return; // don't create empty notes
      store.create(title, content);
      cocoa.setText(titleInput, '');
      cocoa.setText(contentInput, '');
      dirty = true;
    },
    onDelete: (id) => {
      store.delete(id);
      dirty = true;
    },
  });
}

let root = rebuildUI();
let dirty = false;

let layouts = computeLayout(root, win.width, win.height);
const eventSystem = createEventSystem(layouts);
const inputPoller = createInputPoller(glfw, win.handle, eventSystem);

console.log('Vertz Notes — Native App with macOS Text Inputs');
console.log('Type in the text fields, click "Add Note" to create.');
console.log('Click "Delete" to remove notes. Close window to exit.');

win.runLoop(() => {
  const w = win.width;
  const h = win.height;

  // Rebuild scene graph if data changed
  if (dirty) {
    root = rebuildUI();
    dirty = false;
  }

  layouts = computeLayout(root, w, h);
  eventSystem.updateLayouts(layouts);
  inputPoller.poll();

  // Reposition native inputs based on current window height
  // macOS coords: y=0 is bottom, our layout y=0 is top
  const currentH = cocoa.contentHeight(nsWindow);
  // Title input: below header (48px) + padding (16px) + actionbar label (24px)
  const titleY = currentH - (16 + 48 + 8 + 24 + 8 + 24);
  const contentY = titleY - 30;
  const inputW = w - 32 - 120; // leave space for Add button

  cocoa.setFrame(titleInput, 16, titleY, inputW, 24);
  cocoa.setFrame(contentInput, 16, contentY, inputW, 24);

  const commands = collectDrawCommands(root, w, h);
  const rects = commands.filter((c) => c.type === 'rect' && c.color !== 'transparent');
  const texts = commands.filter((c) => c.type === 'text');

  gl.glClearColor(0.1, 0.1, 0.12, 1.0);
  gl.glClear(GL_COLOR_BUFFER_BIT);
  gl.glViewport(0, 0, win.framebufferWidth, win.framebufferHeight);

  rectRenderer.renderRects(rects as RectCommand[], w, h);

  for (const cmd of texts) {
    if (cmd.type === 'text') {
      textRenderer.renderText(cmd.text, cmd.x, cmd.y, [1, 1, 1, 1], w, h);
    }
  }
});

// Cleanup
cocoa.removeFromWindow(titleInput);
cocoa.removeFromWindow(contentInput);
cocoa.release(titleInput);
cocoa.release(contentInput);
rectRenderer.dispose();
textRenderer.dispose();
console.log('Notes app closed.');
win.destroy();
