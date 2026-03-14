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
export const GL_TEXTURE_2D = 0x0de1;
export const GL_TEXTURE_WRAP_S = 0x2802;
export const GL_TEXTURE_WRAP_T = 0x2803;
export const GL_TEXTURE_MIN_FILTER = 0x2801;
export const GL_TEXTURE_MAG_FILTER = 0x2800;
export const GL_CLAMP_TO_EDGE = 0x812f;
export const GL_LINEAR = 0x2601;
export const GL_RED = 0x1903;
export const GL_UNSIGNED_BYTE = 0x1401;
export const GL_UNPACK_ALIGNMENT = 0x0cf5;
export const GL_TEXTURE0 = 0x84c0;

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
  glBlendFunc(sfactor: number, dfactor: number): void;
  glGetShaderiv(shader: number, pname: number, params: Uint8Array): void;
  glGetShaderInfoLog(
    shader: number,
    maxLength: number,
    length: Uint8Array | null,
    infoLog: Uint8Array,
  ): void;
  glGetProgramiv(program: number, pname: number, params: Uint8Array): void;
  glGetProgramInfoLog(
    program: number,
    maxLength: number,
    length: Uint8Array | null,
    infoLog: Uint8Array,
  ): void;
  // Textures
  glGenTextures(n: number, textures: Uint8Array): void;
  glBindTexture(target: number, texture: number): void;
  glTexImage2D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    border: number,
    format: number,
    type: number,
    data: Uint8Array | null,
  ): void;
  glTexSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    type: number,
    data: Uint8Array,
  ): void;
  glTexParameteri(target: number, pname: number, param: number): void;
  glPixelStorei(pname: number, param: number): void;
  glActiveTexture(texture: number): void;
  glUniform1i(location: number, v0: number): void;
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

const { ptr: ptrType } = FFIType;

/**
 * Load OpenGL via FFI.
 */
export function loadGL(): GLBindings {
  const libPath = findGLLibrary();

  const lib = dlopen(libPath, {
    // Clear / viewport
    glClearColor: { args: [f32, f32, f32, f32], returns: ffiVoid },
    glClear: { args: [u32], returns: ffiVoid },
    glViewport: { args: [i32, i32, i32, i32], returns: ffiVoid },
    glEnable: { args: [u32], returns: ffiVoid },
    glDisable: { args: [u32], returns: ffiVoid },
    // Draw
    glDrawArrays: { args: [u32, i32, i32], returns: ffiVoid },
    // VAO
    glGenVertexArrays: { args: [i32, ptrType], returns: ffiVoid },
    glBindVertexArray: { args: [u32], returns: ffiVoid },
    // VBO
    glGenBuffers: { args: [i32, ptrType], returns: ffiVoid },
    glBindBuffer: { args: [u32, u32], returns: ffiVoid },
    glBufferData: { args: [u32, i32, ptrType, u32], returns: ffiVoid },
    // Vertex attributes
    glVertexAttribPointer: { args: [u32, i32, u32, u32, i32, ptrType], returns: ffiVoid },
    glEnableVertexAttribArray: { args: [u32], returns: ffiVoid },
    // Shaders
    glCreateShader: { args: [u32], returns: u32 },
    glShaderSource: { args: [u32, i32, ptrType, ptrType], returns: ffiVoid },
    glCompileShader: { args: [u32], returns: ffiVoid },
    glCreateProgram: { returns: u32 },
    glAttachShader: { args: [u32, u32], returns: ffiVoid },
    glLinkProgram: { args: [u32], returns: ffiVoid },
    glUseProgram: { args: [u32], returns: ffiVoid },
    glDeleteShader: { args: [u32], returns: ffiVoid },
    // Uniforms
    glGetUniformLocation: { args: [u32, ptrType], returns: i32 },
    glUniform4f: { args: [i32, f32, f32, f32, f32], returns: ffiVoid },
    // Blending
    glBlendFunc: { args: [u32, u32], returns: ffiVoid },
    // Error checking
    glGetShaderiv: { args: [u32, u32, ptrType], returns: ffiVoid },
    glGetShaderInfoLog: { args: [u32, i32, ptrType, ptrType], returns: ffiVoid },
    glGetProgramiv: { args: [u32, u32, ptrType], returns: ffiVoid },
    glGetProgramInfoLog: { args: [u32, i32, ptrType, ptrType], returns: ffiVoid },
    // Textures
    glGenTextures: { args: [i32, ptrType], returns: ffiVoid },
    glBindTexture: { args: [u32, u32], returns: ffiVoid },
    glTexImage2D: { args: [u32, i32, i32, i32, i32, i32, u32, u32, ptrType], returns: ffiVoid },
    glTexSubImage2D: {
      args: [u32, i32, i32, i32, i32, i32, u32, u32, ptrType],
      returns: ffiVoid,
    },
    glTexParameteri: { args: [u32, u32, i32], returns: ffiVoid },
    glPixelStorei: { args: [u32, i32], returns: ffiVoid },
    glActiveTexture: { args: [u32], returns: ffiVoid },
    // Uniforms (additional)
    glUniform1i: { args: [i32, i32], returns: ffiVoid },
  });

  return lib.symbols as unknown as GLBindings;
}
