#!/usr/bin/env bun

/**
 * Demo: Native Vertz app with design tokens, layout, text, and input.
 *
 * This shows:
 * - CSS token resolver: bg:primary.600, p:4, rounded:lg → concrete values
 * - NativeElement scene graph with Yoga flexbox layout
 * - FreeType text rendering via glyph atlas + OpenGL textured quads
 * - Mouse input: click handlers, hover (mouseenter/mouseleave)
 * - Responsive resize
 *
 * Run: bun packages/ui-native/examples/demo-app.ts
 */

import { rgbaToHex } from '../src/css/color-utils';
import {
  createNativeTokenResolver,
  defaultDarkTheme,
  oklchToRgba,
  type RGBA,
} from '../src/css/native-token-resolver';
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

// --- Theme setup ---

const theme = {
  ...defaultDarkTheme,
  colors: {
    ...defaultDarkTheme.colors,
    accent: {
      DEFAULT: oklchToRgba('oklch(0.637 0.237 25.331)'), // red-500
      400: oklchToRgba('oklch(0.704 0.191 22.216)'), // red-400
      600: oklchToRgba('oklch(0.577 0.245 27.325)'), // red-600
    },
    success: {
      DEFAULT: oklchToRgba('oklch(0.527 0.154 150.069)'), // green-600
      400: oklchToRgba('oklch(0.648 0.2 131.684)'), // green-400
    },
  },
};

const resolver = createNativeTokenResolver(theme);

/** Resolve a color token to a hex string for the renderer. */
function color(token: string): string {
  const result = resolver.resolve('bg', token);
  if (result.backgroundColor) return rgbaToHex(result.backgroundColor as RGBA);
  return token; // fallback: treat as raw hex
}

// --- Build a scene graph with design tokens ---

const root = new NativeElement('div');
root.setAttribute('style:bg', color('background'));
root.setAttribute('style:padding', '16');
root.setAttribute('style:gap', '8');

// Header
const header = new NativeElement('header');
header.setAttribute('style:bg', color('card'));
header.setAttribute('style:height', '48');
header.setAttribute('style:padding', '12');
header.appendChild(new NativeTextNode('Vertz Native — Design Tokens'));
root.appendChild(header);

// Card row
const cardRow = new NativeElement('div');
cardRow.setAttribute('style:flexDirection', 'row');
cardRow.setAttribute('style:gap', '8');
cardRow.setAttribute('style:height', '80');

let clickCount = 0;

const card1 = new NativeElement('div');
const card1Bg = color('primary.700');
const card1Hover = color('primary.600');
card1.setAttribute('style:bg', card1Bg);
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
  card1.setAttribute('style:bg', card1Hover);
});
card1.addEventListener('mouseleave', () => {
  card1.setAttribute('style:bg', card1Bg);
});
cardRow.appendChild(card1);

const card2 = new NativeElement('div');
const card2Bg = color('primary.800');
const card2Hover = color('primary.700');
card2.setAttribute('style:bg', card2Bg);
card2.setAttribute('style:flexGrow', '1');
card2.setAttribute('style:padding', '12');
card2.appendChild(new NativeTextNode('No WebView'));
card2.addEventListener('click', () => {
  console.log('Card 2 clicked!');
});
card2.addEventListener('mouseenter', () => {
  card2.setAttribute('style:bg', card2Hover);
});
card2.addEventListener('mouseleave', () => {
  card2.setAttribute('style:bg', card2Bg);
});
cardRow.appendChild(card2);

root.appendChild(cardRow);

// Content area
const content = new NativeElement('div');
content.setAttribute('style:bg', color('card'));
content.setAttribute('style:flexGrow', '1');
content.setAttribute('style:padding', '12');
content.setAttribute('style:gap', '8');

const row1 = new NativeElement('div');
row1.setAttribute('style:bg', color('accent.600'));
row1.setAttribute('style:height', '40');
row1.setAttribute('style:padding', '8');
row1.appendChild(new NativeTextNode('GPU rendered'));
content.appendChild(row1);

const row2 = new NativeElement('div');
row2.setAttribute('style:bg', color('success'));
row2.setAttribute('style:flexGrow', '1');
row2.setAttribute('style:padding', '8');
row2.appendChild(new NativeTextNode('Design tokens → native RGBA'));
content.appendChild(row2);

root.appendChild(content);

// Footer
const footer = new NativeElement('footer');
footer.setAttribute('style:bg', color('muted'));
footer.setAttribute('style:height', '32');
footer.setAttribute('style:padding', '6');
footer.appendChild(new NativeTextNode('oklch → sRGB → GPU'));
root.appendChild(footer);

// --- Create window and render ---

const FONT_PATH = '/System/Library/Fonts/Supplemental/Arial.ttf';

const win = createNativeWindow({
  title: 'Vertz Native — Phase 6 Tokens',
  width: 600,
  height: 400,
});

const gl = loadGL();
const glfw = loadGLFW();
const rectRenderer = createGLRenderer(gl);
const textRenderer = createTextRenderer(gl, FONT_PATH, 16);

const initialLayouts = computeLayout(root, win.width, win.height);
const eventSystem = createEventSystem(initialLayouts);
const inputPoller = createInputPoller(glfw, win.handle, eventSystem);

console.log('Vertz Native Demo — Design Tokens + oklch');
console.log('Click the cards to see interaction. Close window to exit.');

let logged = false;

win.runLoop(() => {
  const w = win.width;
  const h = win.height;

  const layouts = computeLayout(root, w, h);
  eventSystem.updateLayouts(layouts);
  inputPoller.poll();

  const commands = collectDrawCommands(root, w, h);
  const rects = commands.filter((c) => c.type === 'rect' && c.color !== 'transparent');
  const texts = commands.filter((c) => c.type === 'text');

  gl.glClearColor(0.1, 0.1, 0.12, 1.0);
  gl.glClear(GL_COLOR_BUFFER_BIT);
  gl.glViewport(0, 0, win.framebufferWidth, win.framebufferHeight);

  rectRenderer.renderRects(rects as import('../src/render/renderer').RectCommand[], w, h);

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
