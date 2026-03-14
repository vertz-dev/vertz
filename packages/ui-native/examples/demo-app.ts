#!/usr/bin/env bun

/**
 * Demo: Native Vertz app with flexbox layout, text, and input.
 *
 * This shows:
 * - NativeElement scene graph with Yoga flexbox layout
 * - FreeType text rendering via glyph atlas + OpenGL textured quads
 * - Mouse input: click handlers, hover (mouseenter/mouseleave)
 * - Padding, gap, flexGrow, row/column direction
 * - Responsive resize
 *
 * Run: bun packages/ui-native/examples/demo-app.ts
 */

import { createEventSystem } from '../src/input/event-system';
import { createInputPoller } from '../src/input/input-poller';
import { computeLayout } from '../src/layout/layout';
import { NativeElement, NativeTextNode } from '../src/native-element';
import { GL_COLOR_BUFFER_BIT, loadGL } from '../src/render/gl-ffi';
import { createGLRenderer } from '../src/render/gl-renderer';
import { collectDrawCommands } from '../src/render/renderer';
import { createTextRenderer } from '../src/text/text-renderer';
import { loadGLFW } from '../src/window/glfw-ffi';
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
header.appendChild(new NativeTextNode('Vertz Native — Input + Hit Testing'));
root.appendChild(header);

// Card row — horizontal layout with clickable cards
const cardRow = new NativeElement('div');
cardRow.setAttribute('style:flexDirection', 'row');
cardRow.setAttribute('style:gap', '8');
cardRow.setAttribute('style:height', '80');

let clickCount = 0;

const card1 = new NativeElement('div');
card1.setAttribute('style:bg', '#0f3460');
card1.setAttribute('style:flexGrow', '1');
card1.setAttribute('style:padding', '12');
const card1Text = new NativeTextNode('Click me! (0)');
card1.appendChild(card1Text);
card1.addEventListener('click', () => {
  clickCount++;
  card1Text.data = `Click me! (${clickCount})`;
  console.log(`Card 1 clicked! Count: ${clickCount}`);
});
card1.addEventListener('mouseenter', () => {
  card1.setAttribute('style:bg', '#1a4d8e');
});
card1.addEventListener('mouseleave', () => {
  card1.setAttribute('style:bg', '#0f3460');
});
cardRow.appendChild(card1);

const card2 = new NativeElement('div');
card2.setAttribute('style:bg', '#533483');
card2.setAttribute('style:flexGrow', '1');
card2.setAttribute('style:padding', '12');
card2.appendChild(new NativeTextNode('No WebView'));
card2.addEventListener('click', () => {
  console.log('Card 2 clicked!');
});
card2.addEventListener('mouseenter', () => {
  card2.setAttribute('style:bg', '#6b44a8');
});
card2.addEventListener('mouseleave', () => {
  card2.setAttribute('style:bg', '#533483');
});
cardRow.appendChild(card2);

root.appendChild(cardRow);

// Content area — fills remaining space
const content = new NativeElement('div');
content.setAttribute('style:bg', '#16213e');
content.setAttribute('style:flexGrow', '1');
content.setAttribute('style:padding', '12');
content.setAttribute('style:gap', '8');

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
row2.appendChild(new NativeTextNode('FreeType + OpenGL text rendering'));
content.appendChild(row2);

root.appendChild(content);

// Footer — fixed height
const footer = new NativeElement('footer');
footer.setAttribute('style:bg', '#0f3460');
footer.setAttribute('style:height', '32');
footer.setAttribute('style:padding', '6');
footer.appendChild(new NativeTextNode('Click the cards above!'));
root.appendChild(footer);

// --- Create window and render ---

const WIDTH = 600;
const HEIGHT = 400;
const FONT_PATH = '/System/Library/Fonts/Supplemental/Arial.ttf';

const win = createNativeWindow({
  title: 'Vertz Native — Phase 5 Input',
  width: WIDTH,
  height: HEIGHT,
});

const gl = loadGL();
const glfw = loadGLFW();
const rectRenderer = createGLRenderer(gl);
const textRenderer = createTextRenderer(gl, FONT_PATH, 16);

// Set up input system
const initialLayouts = computeLayout(root, win.width, win.height);
const eventSystem = createEventSystem(initialLayouts);
const inputPoller = createInputPoller(glfw, win.handle, eventSystem);

console.log('Vertz Native Demo — Input + Hit Testing');
console.log('Click the cards to see interaction. Close window to exit.');

let logged = false;

win.runLoop(() => {
  const w = win.width;
  const h = win.height;

  // Update layouts and poll input
  const layouts = computeLayout(root, w, h);
  eventSystem.updateLayouts(layouts);
  inputPoller.poll();

  const commands = collectDrawCommands(root, w, h);
  const rects = commands.filter((c) => c.type === 'rect' && c.color !== 'transparent');
  const texts = commands.filter((c) => c.type === 'text');

  gl.glClearColor(0.1, 0.1, 0.18, 1.0);
  gl.glClear(GL_COLOR_BUFFER_BIT);
  gl.glViewport(0, 0, win.framebufferWidth, win.framebufferHeight);

  // Draw rectangles first
  rectRenderer.renderRects(rects as import('../src/render/renderer').RectCommand[], w, h);

  // Draw text on top
  for (const cmd of texts) {
    if (cmd.type === 'text') {
      textRenderer.renderText(cmd.text, cmd.x, cmd.y, [1, 1, 1, 1], w, h);
    }
  }

  if (!logged) {
    console.log(
      `Rendering ${rects.length} rects, ${texts.length} text commands, ${commands.length} total`,
    );
    logged = true;
  }
});

rectRenderer.dispose();
textRenderer.dispose();
console.log('Window closed.');
win.destroy();
