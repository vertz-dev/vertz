#!/usr/bin/env bun

/**
 * Demo: Native Vertz app rendering colored boxes.
 *
 * This shows:
 * - NativeElement scene graph (same tree @vertz/ui would produce)
 * - collectDrawCommands() converting tree → draw commands
 * - GLRenderer drawing colored rectangles via shaders
 *
 * Run: bun packages/ui-native/examples/demo-app.ts
 */

import { NativeElement, NativeTextNode } from '../src/native-element';
import { GL_COLOR_BUFFER_BIT, loadGL } from '../src/render/gl-ffi';
import { createGLRenderer } from '../src/render/gl-renderer';
import { collectDrawCommands } from '../src/render/renderer';
import { createNativeWindow } from '../src/window/native-window';

// --- Build a scene graph (this is what @vertz/ui would produce) ---

const root = new NativeElement('div');
root.setAttribute('style:bg', '#1a1a2e');

// Header bar
const header = new NativeElement('header');
header.setAttribute('style:bg', '#16213e');
header.appendChild(new NativeTextNode('Vertz Native'));
root.appendChild(header);

// Blue card
const card1 = new NativeElement('div');
card1.setAttribute('style:bg', '#0f3460');
card1.appendChild(new NativeTextNode('54 MB memory'));
root.appendChild(card1);

// Purple card
const card2 = new NativeElement('div');
card2.setAttribute('style:bg', '#533483');
card2.appendChild(new NativeTextNode('No WebView'));
root.appendChild(card2);

// Red highlight card
const card3 = new NativeElement('div');
card3.setAttribute('style:bg', '#e94560');
card3.appendChild(new NativeTextNode('GPU rendered'));
root.appendChild(card3);

// Green card
const card4 = new NativeElement('div');
card4.setAttribute('style:bg', '#2d6a4f');
card4.appendChild(new NativeTextNode('Same RenderAdapter'));
root.appendChild(card4);

// --- Create window and render ---

const WIDTH = 600;
const HEIGHT = 400;

const win = createNativeWindow({
  title: 'Vertz Native — Phase 2',
  width: WIDTH,
  height: HEIGHT,
});

const gl = loadGL();
const renderer = createGLRenderer(gl);

console.log('Vertz Native Demo — colored rectangles via OpenGL shaders');
console.log('Close the window to exit');

let logged = false;

win.runLoop(() => {
  // Collect draw commands from scene graph
  const commands = collectDrawCommands(root, WIDTH, HEIGHT);

  // Filter to rect commands only (text rendering is Phase 4)
  const rects = commands.filter((c) => c.type === 'rect' && c.color !== 'transparent');

  // Clear background
  gl.glClearColor(0.1, 0.1, 0.18, 1.0);
  gl.glClear(GL_COLOR_BUFFER_BIT);
  gl.glViewport(0, 0, WIDTH, HEIGHT);

  // Render all rectangles in a single batched draw call
  renderer.renderRects(rects as import('../src/render/renderer').RectCommand[], WIDTH, HEIGHT);

  if (!logged) {
    console.log(`Rendering ${rects.length} rectangles, ${commands.length} total commands`);
    logged = true;
  }
});

renderer.dispose();
console.log('Window closed.');
win.destroy();
