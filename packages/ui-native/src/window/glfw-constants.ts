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

// Framebuffer hints
export const GLFW_COCOA_RETINA_FRAMEBUFFER = 0x00023001;
export const GLFW_SCALE_FRAMEBUFFER = 0x0002200d;

// Key codes (subset — extend as needed)
export const GLFW_KEY_SPACE = 32;
export const GLFW_KEY_ESCAPE = 256;
export const GLFW_KEY_ENTER = 257;
export const GLFW_KEY_TAB = 258;
export const GLFW_KEY_BACKSPACE = 259;
export const GLFW_KEY_DELETE = 261;
export const GLFW_KEY_RIGHT = 262;
export const GLFW_KEY_LEFT = 263;
export const GLFW_KEY_DOWN = 264;
export const GLFW_KEY_UP = 265;
export const GLFW_KEY_LEFT_SHIFT = 340;
export const GLFW_KEY_LEFT_CONTROL = 341;
export const GLFW_KEY_LEFT_ALT = 342;
export const GLFW_KEY_LEFT_SUPER = 343;

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
  glfwGetWindowSize(window: number, width: Uint8Array, height: Uint8Array): void;
  glfwGetCursorPos(window: number, xpos: Uint8Array, ypos: Uint8Array): void;
  glfwGetMouseButton(window: number, button: number): number;
  glfwGetKey(window: number, key: number): number;
}
