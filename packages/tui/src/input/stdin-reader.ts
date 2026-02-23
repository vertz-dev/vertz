import type { KeyEvent } from './key-parser';
import { parseKey } from './key-parser';

type KeyListener = (key: KeyEvent) => void;

/**
 * Raw stdin reader for terminal input.
 * Puts stdin in raw mode and parses key events.
 */
export class StdinReader {
  private _stdin: NodeJS.ReadStream;
  private _listeners: KeyListener[] = [];
  private _onData: ((data: Buffer) => void) | null = null;
  private _wasRaw: boolean;

  constructor(stdin?: NodeJS.ReadStream) {
    this._stdin = stdin ?? process.stdin;
    this._wasRaw = this._stdin.isRaw ?? false;
  }

  /** Start reading from stdin in raw mode. */
  start(): void {
    if (this._onData) return; // Already started

    // Enable raw mode for character-by-character input
    if (typeof this._stdin.setRawMode === 'function') {
      this._stdin.setRawMode(true);
    }
    this._stdin.resume();

    this._onData = (data: Buffer) => {
      const key = parseKey(data);

      // Dispatch to listeners first so components can handle Ctrl+C
      for (const listener of this._listeners) {
        listener(key);
      }

      // Default Ctrl+C handler — exit gracefully when stdin is in raw mode
      if (key.ctrl && key.name === 'c') {
        process.exit(130);
      }
    };

    this._stdin.on('data', this._onData);
  }

  /** Stop reading and restore stdin state. */
  stop(): void {
    if (this._onData) {
      this._stdin.off('data', this._onData);
      this._onData = null;
    }

    // Restore raw mode state
    if (typeof this._stdin.setRawMode === 'function') {
      this._stdin.setRawMode(this._wasRaw);
    }
    this._stdin.pause();
  }

  /** Register a key listener. Returns cleanup function. */
  onKey(listener: KeyListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  /** Remove all listeners. */
  dispose(): void {
    this.stop();
    this._listeners = [];
  }
}
