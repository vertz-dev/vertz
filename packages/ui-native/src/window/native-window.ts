/**
 * High-level native window abstraction.
 *
 * Wraps GLFW to provide a simple API for creating and managing
 * native windows. This is the entry point for @vertz/ui-native apps.
 */

import {
  GLFW_COCOA_RETINA_FRAMEBUFFER,
  GLFW_CONTEXT_VERSION_MAJOR,
  GLFW_CONTEXT_VERSION_MINOR,
  GLFW_FALSE,
  GLFW_OPENGL_CORE_PROFILE,
  GLFW_OPENGL_FORWARD_COMPAT,
  GLFW_OPENGL_PROFILE,
  GLFW_RESIZABLE,
  GLFW_SCALE_FRAMEBUFFER,
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
  /** Enable retina/HiDPI framebuffer. Default: false (saves ~50MB on retina displays). */
  retina?: boolean;
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
  /** Current framebuffer width in pixels — use for glViewport. */
  readonly framebufferWidth: number;
  /** Current framebuffer height in pixels — use for glViewport. */
  readonly framebufferHeight: number;
  /** Current window width in screen coordinates — use for layout and hit testing. */
  readonly width: number;
  /** Current window height in screen coordinates — use for layout and hit testing. */
  readonly height: number;
  /** The native NSWindow pointer (macOS only — for Cocoa overlay controls). */
  readonly nsWindow: number;
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

  // Disable retina by default — saves ~50MB of IOSurface memory on retina displays.
  // At 1x, an 800x600 window uses ~7.5MB of IOSurface vs ~29MB at 2x retina.
  const useRetina = options.retina === true;
  glfw.glfwWindowHint(GLFW_COCOA_RETINA_FRAMEBUFFER, useRetina ? GLFW_TRUE : GLFW_FALSE);
  glfw.glfwWindowHint(GLFW_SCALE_FRAMEBUFFER, useRetina ? GLFW_TRUE : GLFW_FALSE);

  // Configure OpenGL 3.3 core profile
  glfw.glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
  glfw.glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
  glfw.glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
  glfw.glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GLFW_TRUE);
  glfw.glfwWindowHint(GLFW_RESIZABLE, options.resizable !== false ? GLFW_TRUE : GLFW_FALSE);
  glfw.glfwWindowHint(GLFW_VISIBLE, options.visible !== false ? GLFW_TRUE : GLFW_FALSE);

  const titleBuf = toCString(options.title);
  const maybeHandle = glfw.glfwCreateWindow(options.width, options.height, titleBuf, null, null);

  if (!maybeHandle) {
    glfw.glfwTerminate();
    throw new Error('Failed to create GLFW window');
  }

  const handle: number = maybeHandle;
  const g = glfw;
  g.glfwMakeContextCurrent(handle);
  g.glfwSwapInterval(1); // VSync

  // Buffers for reading sizes via FFI (reused each call)
  const fbWidthBuf = new Uint8Array(4);
  const fbHeightBuf = new Uint8Array(4);
  const fbWidthView = new DataView(fbWidthBuf.buffer);
  const fbHeightView = new DataView(fbHeightBuf.buffer);
  const winWidthBuf = new Uint8Array(4);
  const winHeightBuf = new Uint8Array(4);
  const winWidthView = new DataView(winWidthBuf.buffer);
  const winHeightView = new DataView(winHeightBuf.buffer);

  function getFramebufferSize(): { width: number; height: number } {
    g.glfwGetFramebufferSize(handle, fbWidthBuf, fbHeightBuf);
    return {
      width: fbWidthView.getInt32(0, true),
      height: fbHeightView.getInt32(0, true),
    };
  }

  function getWindowSize(): { width: number; height: number } {
    g.glfwGetWindowSize(handle, winWidthBuf, winHeightBuf);
    return {
      width: winWidthView.getInt32(0, true),
      height: winHeightView.getInt32(0, true),
    };
  }

  return {
    get handle() {
      return handle;
    },
    get nsWindow() {
      return g.glfwGetCocoaWindow(handle) as number;
    },
    get framebufferWidth() {
      return getFramebufferSize().width;
    },
    get framebufferHeight() {
      return getFramebufferSize().height;
    },
    get width() {
      return getWindowSize().width;
    },
    get height() {
      return getWindowSize().height;
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
