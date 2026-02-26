/** Well-known CI environment variables across major providers. */
const CI_ENV_VARS = [
  'CI', // Generic (GitHub Actions, GitLab CI, CircleCI, Travis, etc.)
  'GITHUB_ACTIONS', // GitHub Actions
  'GITLAB_CI', // GitLab CI
  'CIRCLECI', // CircleCI
  'TRAVIS', // Travis CI
  'JENKINS_URL', // Jenkins
  'BUILD_NUMBER', // Jenkins / TeamCity
  'BUILDKITE', // Buildkite
  'CODEBUILD_BUILD_ID', // AWS CodeBuild
  'TF_BUILD', // Azure Pipelines
] as const;

/**
 * Detect whether the current environment is interactive (has a TTY).
 * Returns false in CI, piped stdin, or non-TTY environments.
 */
export function isInteractive(): boolean {
  // Check well-known CI environment variables
  for (const envVar of CI_ENV_VARS) {
    if (process.env[envVar]) return false;
  }

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
