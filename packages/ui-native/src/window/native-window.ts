/**
 * High-level native window abstraction.
 *
 * Wraps GLFW to provide a simple API for creating and managing
 * native windows. This is the entry point for @vertz/ui-native apps.
 */

import {
  GLFW_CONTEXT_VERSION_MAJOR,
  GLFW_CONTEXT_VERSION_MINOR,
  GLFW_FALSE,
  GLFW_OPENGL_CORE_PROFILE,
  GLFW_OPENGL_FORWARD_COMPAT,
  GLFW_OPENGL_PROFILE,
  GLFW_RESIZABLE,
  GLFW_TRUE,
  GLFW_VISIBLE,
  type GLFWBindings,
} from './glfw-constants';
import { loadGLFW, toCString } from './glfw-ffi';

export interface NativeWindowOptions {
  title: string;
  width: number;
  height: number;
  resizable?: boolean;
  visible?: boolean;
}

/**
 * A native GPU-backed window.
 *
 * Usage:
 * ```ts
 * const win = createNativeWindow({ title: 'My App', width: 800, height: 600 });
 * win.runLoop(() => {
 *   // render frame
 * });
 * win.destroy();
 * ```
 */
export interface NativeWindow {
  /** The raw GLFW window pointer (for advanced FFI usage). */
  readonly handle: number;
  /** Window width in pixels. */
  readonly width: number;
  /** Window height in pixels. */
  readonly height: number;
  /** Whether the window close was requested. */
  shouldClose(): boolean;
  /** Swap front/back buffers (present frame). */
  swapBuffers(): void;
  /** Poll OS events (must be called each frame). */
  pollEvents(): void;
  /** Run a simple render loop until close is requested. */
  runLoop(onFrame: () => void): void;
  /** Destroy the window and terminate GLFW. */
  destroy(): void;
}

let glfw: GLFWBindings | null = null;

/**
 * Create a native window backed by GLFW + OpenGL.
 *
 * Requires GLFW to be installed on the system.
 * - macOS: `brew install glfw`
 * - Linux: `sudo apt-get install libglfw3-dev`
 */
export function createNativeWindow(options: NativeWindowOptions): NativeWindow {
  if (!glfw) {
    glfw = loadGLFW();
    if (!glfw.glfwInit()) {
      throw new Error('Failed to initialize GLFW');
    }
  }

  // Configure OpenGL 3.3 core profile
  glfw.glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
  glfw.glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
  glfw.glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
  glfw.glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GLFW_TRUE);
  glfw.glfwWindowHint(GLFW_RESIZABLE, options.resizable !== false ? GLFW_TRUE : GLFW_FALSE);
  glfw.glfwWindowHint(GLFW_VISIBLE, options.visible !== false ? GLFW_TRUE : GLFW_FALSE);

  const titleBuf = toCString(options.title);
  const handle = glfw.glfwCreateWindow(options.width, options.height, titleBuf, null, null);

  if (!handle) {
    glfw.glfwTerminate();
    throw new Error('Failed to create GLFW window');
  }

  const g = glfw;
  g.glfwMakeContextCurrent(handle);
  g.glfwSwapInterval(1); // VSync

  return {
    get handle() {
      return handle;
    },
    get width() {
      return options.width;
    },
    get height() {
      return options.height;
    },
    shouldClose() {
      return g.glfwWindowShouldClose(handle) !== 0;
    },
    swapBuffers() {
      g.glfwSwapBuffers(handle);
    },
    pollEvents() {
      g.glfwPollEvents();
    },
    runLoop(onFrame: () => void) {
      while (!this.shouldClose()) {
        onFrame();
        this.swapBuffers();
        this.pollEvents();
      }
    },
    destroy() {
      g.glfwDestroyWindow(handle);
      g.glfwTerminate();
      glfw = null;
    },
  };
}
