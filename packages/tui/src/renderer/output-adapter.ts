/**
 * Output adapter interface. Abstracts stdout for testing.
 */
export interface OutputAdapter {
  /** Write a string to the output. */
  write(data: string): void;
  /** Get terminal width in columns. */
  readonly columns: number;
  /** Get terminal height in rows. */
  readonly rows: number;
}

/** Adapter that writes to process.stdout. */
export class StdoutAdapter implements OutputAdapter {
  private _stdout: NodeJS.WriteStream;

  constructor(stdout?: NodeJS.WriteStream) {
    this._stdout = stdout ?? process.stdout;
  }

  write(data: string): void {
    this._stdout.write(data);
  }

  get columns(): number {
    return this._stdout.columns ?? 80;
  }

  get rows(): number {
    return this._stdout.rows ?? 24;
  }
}
