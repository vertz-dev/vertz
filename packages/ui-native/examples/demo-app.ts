#!/usr/bin/env bun

/**
 * Demo: Native Vertz app with flexbox layout.
 *
 * This shows:
 * - NativeElement scene graph with Yoga flexbox layout
 * - Padding, gap, flexGrow, row/column direction
 * - collectDrawCommands() using computed Yoga layout
 * - GLRenderer drawing rectangles via batched shaders
 *
 * Run: bun packages/ui-native/examples/demo-app.ts
 */

import { NativeElement, NativeTextNode } from '../src/native-element';
import { GL_COLOR_BUFFER_BIT, loadGL } from '../src/render/gl-ffi';
import { createGLRenderer } from '../src/render/gl-renderer';
import { collectDrawCommands } from '../src/render/renderer';
import { createNativeWindow } from '../src/window/native-window';

// --- Build a scene graph with flexbox layout ---

const root = new NativeElement('div');
root.setAttribute('style:bg', '#1a1a2e');
root.setAttribute('style:padding', '16');
root.setAttribute('style:gap', '8');

// Header bar — fixed height
const header = new NativeElement('header');
header.setAttribute('style:bg', '#16213e');
header.setAttribute('style:height', '48');
header.setAttribute('style:padding', '12');
header.appendChild(new NativeTextNode('Vertz Native — Flexbox Layout'));
root.appendChild(header);

// Card row — horizontal layout
const cardRow = new NativeElement('div');
cardRow.setAttribute('style:flexDirection', 'row');
cardRow.setAttribute('style:gap', '8');
cardRow.setAttribute('style:height', '80');

const card1 = new NativeElement('div');
card1.setAttribute('style:bg', '#0f3460');
card1.setAttribute('style:flexGrow', '1');
card1.setAttribute('style:padding', '8');
card1.appendChild(new NativeTextNode('54 MB memory'));
cardRow.appendChild(card1);

const card2 = new NativeElement('div');
card2.setAttribute('style:bg', '#533483');
card2.setAttribute('style:flexGrow', '1');
card2.setAttribute('style:padding', '8');
card2.appendChild(new NativeTextNode('No WebView'));
cardRow.appendChild(card2);

root.appendChild(cardRow);

// Content area — fills remaining space
const content = new NativeElement('div');
content.setAttribute('style:bg', '#16213e');
content.setAttribute('style:flexGrow', '1');
content.setAttribute('style:padding', '12');
content.setAttribute('style:gap', '8');

// Two rows inside content
const row1 = new NativeElement('div');
row1.setAttribute('style:bg', '#e94560');
row1.setAttribute('style:height', '40');
row1.setAttribute('style:padding', '8');
row1.appendChild(new NativeTextNode('GPU rendered'));
content.appendChild(row1);

const row2 = new NativeElement('div');
row2.setAttribute('style:bg', '#2d6a4f');
row2.setAttribute('style:flexGrow', '1');
row2.setAttribute('style:padding', '8');
row2.appendChild(new NativeTextNode('Yoga flexbox layout'));
content.appendChild(row2);

root.appendChild(content);

// Footer — fixed height
const footer = new NativeElement('footer');
footer.setAttribute('style:bg', '#0f3460');
footer.setAttribute('style:height', '32');
footer.setAttribute('style:padding', '6');
footer.appendChild(new NativeTextNode('Same RenderAdapter interface'));
root.appendChild(footer);

// --- Create window and render ---

const WIDTH = 600;
const HEIGHT = 400;

const win = createNativeWindow({
  title: 'Vertz Native — Phase 3 Flexbox',
  width: WIDTH,
  height: HEIGHT,
});

const gl = loadGL();
const renderer = createGLRenderer(gl);

console.log('Vertz Native Demo — Yoga flexbox layout + OpenGL shaders');
console.log('Close the window to exit');

let logged = false;

win.runLoop(() => {
  const commands = collectDrawCommands(root, WIDTH, HEIGHT);
  const rects = commands.filter((c) => c.type === 'rect' && c.color !== 'transparent');

  gl.glClearColor(0.1, 0.1, 0.18, 1.0);
  gl.glClear(GL_COLOR_BUFFER_BIT);
  gl.glViewport(0, 0, WIDTH, HEIGHT);

  renderer.renderRects(rects as import('../src/render/renderer').RectCommand[], WIDTH, HEIGHT);

  if (!logged) {
    console.log(`Rendering ${rects.length} rectangles, ${commands.length} total commands`);
    logged = true;
  }
});

renderer.dispose();
console.log('Window closed.');
win.destroy();
