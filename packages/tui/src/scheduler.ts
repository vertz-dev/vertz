/** Frame scheduler — coalesces multiple signal updates into a single render frame. */

type FrameCallback = () => void;

let scheduled = false;
let frameCallback: FrameCallback | null = null;

/** Register the frame callback (the render loop). */
export function setFrameCallback(cb: FrameCallback | null): void {
  frameCallback = cb;
}

/** Schedule a frame to be rendered on the next event loop tick. */
export function scheduleFrame(): void {
  if (scheduled || !frameCallback) return;
  scheduled = true;
  // Use setImmediate to run after I/O events but before timers.
  // Falls back to setTimeout(0) in environments without setImmediate.
  if (typeof setImmediate === 'function') {
    setImmediate(flushFrame);
  } else {
    setTimeout(flushFrame, 0);
  }
}

function flushFrame(): void {
  scheduled = false;
  if (frameCallback) {
    frameCallback();
  }
}

/** Synchronously flush the pending frame (for testing). */
export function flushSync(): void {
  if (scheduled && frameCallback) {
    scheduled = false;
    frameCallback();
  }
}
