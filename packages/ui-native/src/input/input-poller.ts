/**
 * GLFW input poller.
 *
 * Reads mouse position and button state from GLFW each frame
 * and translates state changes into EventSystem calls.
 */

import { GLFW_MOUSE_BUTTON_LEFT, GLFW_PRESS, type GLFWBindings } from '../window/glfw-constants';
import type { EventSystem } from './event-system';

export interface InputPoller {
  /** Poll GLFW for input state and dispatch events. Call once per frame. */
  poll(): void;
}

/**
 * Create an input poller that reads GLFW state and feeds the event system.
 */
export function createInputPoller(
  glfw: GLFWBindings,
  windowHandle: number,
  eventSystem: EventSystem,
): InputPoller {
  const xBuf = new Uint8Array(8); // double = 8 bytes
  const yBuf = new Uint8Array(8);
  const xView = new DataView(xBuf.buffer);
  const yView = new DataView(yBuf.buffer);

  let prevMouseDown = false;

  return {
    poll() {
      // Read cursor position (GLFW returns doubles)
      glfw.glfwGetCursorPos(windowHandle, xBuf, yBuf);
      const mouseX = xView.getFloat64(0, true);
      const mouseY = yView.getFloat64(0, true);

      // Read left mouse button state
      const mouseDown =
        glfw.glfwGetMouseButton(windowHandle, GLFW_MOUSE_BUTTON_LEFT) === GLFW_PRESS;

      // Process mouse movement
      eventSystem.processMouseMove(mouseX, mouseY);

      // Process button state changes
      if (mouseDown && !prevMouseDown) {
        eventSystem.processMouseButton(mouseX, mouseY, 'press');
      } else if (!mouseDown && prevMouseDown) {
        eventSystem.processMouseButton(mouseX, mouseY, 'release');
      }

      prevMouseDown = mouseDown;
    },
  };
}
