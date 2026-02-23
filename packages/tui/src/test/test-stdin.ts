import type { KeyEvent } from '../input/key-parser';

type KeyListener = (key: KeyEvent) => void;

/**
 * Test stdin that allows programmatic key injection for testing.
 */
export class TestStdin {
  private _listeners: KeyListener[] = [];

  /** Register a key listener. Returns a cleanup function. */
  onKey(listener: KeyListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  /** Simulate a key press. */
  pressKey(name: string, options?: Partial<Omit<KeyEvent, 'name'>>): void {
    const event: KeyEvent = {
      name,
      char: options?.char ?? (name.length === 1 ? name : ''),
      ctrl: options?.ctrl ?? false,
      shift: options?.shift ?? false,
      meta: options?.meta ?? false,
    };
    // Snapshot listeners to prevent infinite loops when handlers trigger re-renders
    // that register new listeners during iteration
    const snapshot = [...this._listeners];
    for (const listener of snapshot) {
      listener(event);
    }
  }

  /** Simulate typing a string character by character. */
  type(text: string): void {
    for (const char of text) {
      this.pressKey(char, { char });
    }
  }

  /** Remove all listeners. */
  dispose(): void {
    this._listeners = [];
  }
}
