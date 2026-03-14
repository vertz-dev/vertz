#!/usr/bin/env bun
/**
 * Phase 1 POC: Open a native window with a colored background.
 *
 * Prerequisites:
 *   brew install glfw   (macOS)
 *
 * Run:
 *   bun run examples/hello-window.ts
 */

import { createNativeWindow } from '../src/window/native-window';
import { loadGL, GL_COLOR_BUFFER_BIT } from '../src/render/gl-ffi';

console.log('Creating native window...');

const win = createNativeWindow({
  title: 'Vertz Native — Hello Window',
  width: 800,
  height: 600,
});

console.log(`Window created (${win.width}x${win.height})`);

const gl = loadGL();

// Set a nice blue background (Vertz primary color)
gl.glViewport(0, 0, win.width, win.height);

let frame = 0;
win.runLoop(() => {
  // Animate the background color
  const t = frame / 120;
  const r = 0.06 + 0.02 * Math.sin(t);
  const g = 0.12 + 0.04 * Math.sin(t + 1);
  const b = 0.24 + 0.08 * Math.sin(t + 2);

  gl.glClearColor(r, g, b, 1.0);
  gl.glClear(GL_COLOR_BUFFER_BIT);

  frame++;
});

console.log('Window closed.');
win.destroy();
