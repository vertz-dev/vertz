/**
 * Detect whether the current environment is interactive (has a TTY).
 * Returns false in CI, piped stdin, or non-TTY environments.
 */
export function isInteractive(): boolean {
  // CI environment variable (GitHub Actions, GitLab CI, CircleCI, etc.)
  if (process.env.CI) return false;

  // Check if stdin and stdout are TTYs
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;

  return true;
}

/** Error thrown when an interactive prompt is required but the environment is non-interactive. */
export class NonInteractiveError extends Error {
  constructor(promptType: string) {
    super(
      `Cannot run interactive ${promptType} prompt in non-interactive environment. ` +
        'Provide a default value or run in an interactive terminal.',
    );
    this.name = 'NonInteractiveError';
  }
}
