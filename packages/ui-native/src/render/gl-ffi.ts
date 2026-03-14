/**
 * Minimal OpenGL FFI bindings for basic rendering.
 *
 * Only the subset needed to clear the screen and draw colored rectangles.
 * More functions will be added as the renderer grows.
 */

import { dlopen, FFIType } from 'bun:ffi';

const { i32, void: ffiVoid, f32, u32 } = FFIType;

// OpenGL constants
export const GL_COLOR_BUFFER_BIT = 0x00004000;
export const GL_DEPTH_BUFFER_BIT = 0x00000100;
export const GL_TRIANGLES = 0x0004;
export const GL_FLOAT = 0x1406;
export const GL_FALSE = 0;
export const GL_TRUE = 1;
export const GL_ARRAY_BUFFER = 0x8892;
export const GL_STATIC_DRAW = 0x88e4;
export const GL_VERTEX_SHADER = 0x8b31;
export const GL_FRAGMENT_SHADER = 0x8b30;
export const GL_COMPILE_STATUS = 0x8b81;
export const GL_LINK_STATUS = 0x8b82;

export interface GLBindings {
  glClearColor(r: number, g: number, b: number, a: number): void;
  glClear(mask: number): void;
  glViewport(x: number, y: number, width: number, height: number): void;
  glEnable(cap: number): void;
  glDisable(cap: number): void;
  glGenVertexArrays(n: number, arrays: Uint8Array): void;
  glBindVertexArray(array: number): void;
  glGenBuffers(n: number, buffers: Uint8Array): void;
  glBindBuffer(target: number, buffer: number): void;
  glBufferData(target: number, size: number, data: Uint8Array, usage: number): void;
  glVertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: number,
    stride: number,
    pointer: number,
  ): void;
  glEnableVertexAttribArray(index: number): void;
  glDrawArrays(mode: number, first: number, count: number): void;
  glCreateShader(type: number): number;
  glShaderSource(shader: number, count: number, string: Uint8Array, length: null): void;
  glCompileShader(shader: number): void;
  glCreateProgram(): number;
  glAttachShader(program: number, shader: number): void;
  glLinkProgram(program: number): void;
  glUseProgram(program: number): void;
  glDeleteShader(shader: number): void;
  glGetUniformLocation(program: number, name: Uint8Array): number;
  glUniform4f(location: number, v0: number, v1: number, v2: number, v3: number): void;
}

/**
 * Locate the OpenGL framework/library.
 */
function findGLLibrary(): string {
  if (process.platform === 'darwin') {
    return '/System/Library/Frameworks/OpenGL.framework/OpenGL';
  }
  // Linux
  const candidates = [
    '/usr/lib/x86_64-linux-gnu/libGL.so.1',
    '/usr/lib/libGL.so.1',
    '/usr/lib64/libGL.so.1',
  ];
  for (const path of candidates) {
    try {
      Bun.file(path).size;
      return path;
    } catch {}
  }
  throw new Error('Could not find OpenGL library');
}

/**
 * Load OpenGL via FFI.
 */
export function loadGL(): GLBindings {
  const libPath = findGLLibrary();

  const lib = dlopen(libPath, {
    glClearColor: { args: [f32, f32, f32, f32], returns: ffiVoid },
    glClear: { args: [u32], returns: ffiVoid },
    glViewport: { args: [i32, i32, i32, i32], returns: ffiVoid },
    glEnable: { args: [u32], returns: ffiVoid },
    glDisable: { args: [u32], returns: ffiVoid },
    glDrawArrays: { args: [u32, i32, i32], returns: ffiVoid },
  });

  return lib.symbols as unknown as GLBindings;
}
