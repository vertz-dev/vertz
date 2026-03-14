/**
 * GLFW FFI bindings via bun:ffi.
 *
 * Loads libglfw3 dynamically and exposes typed wrappers
 * around the C functions needed for window management.
 */

import { dlopen, FFIType } from 'bun:ffi';
import type { GLFWBindings } from './glfw-constants';

const { i32, void: ffiVoid, ptr: ptrType } = FFIType;

/**
 * Locate the GLFW shared library.
 * Checks common installation paths on macOS and Linux.
 */
function findGLFWLibrary(): string {
  const candidates =
    process.platform === 'darwin'
      ? [
          '/opt/homebrew/lib/libglfw.3.dylib',
          '/usr/local/lib/libglfw.3.dylib',
          '/opt/homebrew/lib/libglfw.dylib',
          '/usr/local/lib/libglfw.dylib',
        ]
      : [
          '/usr/lib/x86_64-linux-gnu/libglfw.so.3',
          '/usr/lib/libglfw.so.3',
          '/usr/lib64/libglfw.so.3',
          '/usr/local/lib/libglfw.so.3',
        ];

  for (const path of candidates) {
    try {
      // Check if file exists
      Bun.file(path).size;
      return path;
    } catch {}
  }

  throw new Error(
    `Could not find GLFW library. Install it with:\n` +
      `  macOS:  brew install glfw\n` +
      `  Linux:  sudo apt-get install libglfw3-dev`,
  );
}

/**
 * Load GLFW via FFI and return typed bindings.
 *
 * This is lazy — call it once and cache the result.
 * Throws if GLFW is not installed on the system.
 */
export function loadGLFW(): GLFWBindings {
  const libPath = findGLFWLibrary();

  const lib = dlopen(libPath, {
    glfwInit: { returns: i32 },
    glfwTerminate: { returns: ffiVoid },
    glfwWindowHint: { args: [i32, i32], returns: ffiVoid },
    glfwCreateWindow: {
      args: [i32, i32, ptrType, ptrType, ptrType],
      returns: ptrType,
    },
    glfwDestroyWindow: { args: [ptrType], returns: ffiVoid },
    glfwMakeContextCurrent: { args: [ptrType], returns: ffiVoid },
    glfwSwapBuffers: { args: [ptrType], returns: ffiVoid },
    glfwPollEvents: { returns: ffiVoid },
    glfwWindowShouldClose: { args: [ptrType], returns: i32 },
    glfwSetWindowShouldClose: { args: [ptrType, i32], returns: ffiVoid },
    glfwGetFramebufferSize: {
      args: [ptrType, ptrType, ptrType],
      returns: ffiVoid,
    },
    glfwSwapInterval: { args: [i32], returns: ffiVoid },
    glfwGetCursorPos: {
      args: [ptrType, ptrType, ptrType],
      returns: ffiVoid,
    },
    glfwGetMouseButton: { args: [ptrType, i32], returns: i32 },
    glfwGetKey: { args: [ptrType, i32], returns: i32 },
  });

  return lib.symbols as unknown as GLFWBindings;
}

/**
 * Encode a string as a null-terminated C string buffer.
 */
export function toCString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const buf = new Uint8Array(bytes.length + 1);
  buf.set(bytes);
  buf[bytes.length] = 0;
  return buf;
}
