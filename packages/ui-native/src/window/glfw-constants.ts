/**
 * GLFW constants and type definitions for FFI bindings.
 *
 * These match the values from glfw3.h.
 * See: https://www.glfw.org/docs/latest/glfw3_8h.html
 */

// Boolean values
export const GLFW_TRUE = 1;
export const GLFW_FALSE = 0;

// Window hints
export const GLFW_RESIZABLE = 0x00020003;
export const GLFW_VISIBLE = 0x00020004;
export const GLFW_DECORATED = 0x00020005;
export const GLFW_FOCUSED = 0x00020001;
export const GLFW_FLOATING = 0x00020007;
export const GLFW_TRANSPARENT_FRAMEBUFFER = 0x0002000a;

// Context hints
export const GLFW_CONTEXT_VERSION_MAJOR = 0x00022002;
export const GLFW_CONTEXT_VERSION_MINOR = 0x00022003;
export const GLFW_OPENGL_PROFILE = 0x00022008;
export const GLFW_OPENGL_FORWARD_COMPAT = 0x00022006;

// OpenGL profile values
export const GLFW_OPENGL_CORE_PROFILE = 0x00032001;

// Key codes (subset — extend as needed)
export const GLFW_KEY_ESCAPE = 256;
export const GLFW_KEY_ENTER = 257;
export const GLFW_KEY_TAB = 258;
export const GLFW_KEY_BACKSPACE = 259;

// Mouse buttons
export const GLFW_MOUSE_BUTTON_LEFT = 0;
export const GLFW_MOUSE_BUTTON_RIGHT = 1;
export const GLFW_MOUSE_BUTTON_MIDDLE = 2;

// Action values
export const GLFW_RELEASE = 0;
export const GLFW_PRESS = 1;
export const GLFW_REPEAT = 2;

/**
 * Type definition for the FFI-loaded GLFW function bindings.
 * Each method corresponds to a glfw* C function.
 */
export interface GLFWBindings {
  glfwInit(): number;
  glfwTerminate(): void;
  glfwWindowHint(hint: number, value: number): void;
  glfwCreateWindow(
    width: number,
    height: number,
    title: Uint8Array,
    monitor: null,
    share: null,
  ): number | null;
  glfwDestroyWindow(window: number): void;
  glfwMakeContextCurrent(window: number): void;
  glfwSwapBuffers(window: number): void;
  glfwPollEvents(): void;
  glfwWindowShouldClose(window: number): number;
  glfwSetWindowShouldClose(window: number, value: number): void;
  glfwGetFramebufferSize(window: number, width: Uint8Array, height: Uint8Array): void;
  glfwSwapInterval(interval: number): void;
}
