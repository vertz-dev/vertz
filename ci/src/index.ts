/**
 * Vertz CI pipeline — runs lint, build, typecheck, and tests in a Bun container.
 *
 * Run locally: dagger call ci
 * Run a single check: dagger call lint / dagger call build / dagger call typecheck / dagger call test
 * Smart skip: dagger call smart-ci --base-branch main
 * Debug shell: dagger call base terminal
 * Coverage: dagger call test-coverage export --path=./coverage
 */
import { argument, type Container, type Directory, type Service, dag, func, object } from "@dagger.io/dagger"

/**
 * Glob patterns for paths that require the full CI pipeline.
 * If a changed file matches any of these, all checks run.
 * Everything else (docs, plans, config files, etc.) is skipped.
 *
 * IMPORTANT: These patterns are duplicated in .github/workflows/ci.yml
 * (the "changes" job) for the GitHub-level skip logic. If you add or
 * remove a pattern here, update the workflow file too.
 */
const SOURCE_PATTERNS = [
  "packages/",
  "biome-plugins/",
  "ci/",
  "biome.json",
  "tsconfig.json",
  "package.json",
  "bun.lock",
  "dagger.json",
  "lefthook.yml",
]

/**
 * Check whether a file path matches any of the source patterns that require CI.
 */
function isSourcePath(filePath: string): boolean {
  return SOURCE_PATTERNS.some((pattern) => filePath.startsWith(pattern) || filePath === pattern.replace(/\/$/, ""))
}

@object()
export class Ci {
  /**
   * Build a Bun container with project dependencies installed.
   */
  @func()
  base(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Container {
    return dag
      .container()
      .from("oven/bun:1")
      .withMountedCache("/root/.bun/install/cache", dag.cacheVolume("bun-cache"))
      .withDirectory("/app", source)
      .withWorkdir("/app")
      .withExec(["bun", "install", "--frozen-lockfile"])
  }

  /**
   * Create a PostgreSQL 16 service container for integration tests.
   * Returns a Dagger Service that can be bound to test containers.
   */
  private postgres(): Service {
    return dag
      .container()
      .from("postgres:16-alpine")
      .withEnvVariable("POSTGRES_USER", "postgres")
      .withEnvVariable("POSTGRES_PASSWORD", "postgres")
      .withEnvVariable("POSTGRES_DB", "vertz_test")
      .withExposedPort(5432)
      .asService()
  }

  /**
   * Add Postgres service and DATABASE_TEST_URL to a container.
   * The service is reachable at hostname "postgres" from within the Dagger network.
   */
  private withPostgres(ctr: Container): Container {
    return ctr
      .withServiceBinding("postgres", this.postgres())
      .withEnvVariable("DATABASE_TEST_URL", "postgres://postgres:postgres@postgres:5432/vertz_test")
  }

  /**
   * Run biome lint checks.
   */
  @func()
  async lint(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec(["bun", "run", "lint"])
      .withExec(["echo", "Lint passed"])
      .stdout()
  }

  /**
   * Build all packages.
   */
  @func()
  async build(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withExec(["echo", "Build passed"])
      .stdout()
  }

  /**
   * Run TypeScript type checking across all packages.
   * Builds first since typecheck needs .d.ts files from workspace packages.
   */
  @func()
  async typecheck(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withExec(["bun", "run", "typecheck"])
      .withExec(["echo", "Typecheck passed"])
      .stdout()
  }

  /**
   * Run vitest tests across all packages.
   * Builds first since tests may import from workspace packages.
   * Starts a Postgres service so @vertz/db integration tests can run against a real database.
   *
   * Note: coverage collection is handled by the dedicated coverage job in the
   * GitHub Actions workflow, not here. Use testCoverage() for explicit coverage runs.
   */
  @func()
  async test(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    const ctr = this.base(source)
      .withExec(["bun", "run", "--filter", "*", "build"])
    return this.withPostgres(ctr)
      .withExec(["bun", "run", "test"])
      .withExec(["echo", "Tests passed"])
      .stdout()
  }

  /**
   * Run tests with coverage and return the coverage directory.
   * Use: dagger call test-coverage export --path=./coverage
   */
  @func()
  async testCoverage(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<Directory> {
    const ctr = this.base(source)
      .withExec(["bun", "run", "--filter", "*", "build"])
    const withPg = this.withPostgres(ctr)
      .withExec(["bun", "run", "test", "--", "--coverage"])

    return withPg.directory("/app")
  }

  /**
   * Run static checks: lint, build, typecheck (no tests).
   */
  @func()
  async check(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec(["bun", "run", "lint"])
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withExec(["bun", "run", "typecheck"])
      .withExec(["echo", "Check passed"])
      .stdout()
  }

  /**
   * Run integration tests for a specific runtime (bun, node, or deno).
   * Builds first since tests may import from workspace packages.
   */
  @func()
  async testRuntime(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
    runtime: string = "bun",
  ): Promise<string> {
    const ctr = this.base(source)
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withEnvVariable("RUNTIME", runtime)
    return this.withPostgres(ctr)
      .withExec(["bun", "run", "test"])
      .withExec(["echo", `Tests passed for runtime: ${runtime}`])
      .stdout()
  }

  /**
   * Run the full CI pipeline: lint, build, typecheck, test.
   * Postgres is started before the test step so @vertz/db integration tests work.
   */
  @func()
  async ci(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    const ctr = this.base(source)
      .withExec(["bun", "run", "lint"])
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withExec(["bun", "run", "typecheck"])
    return this.withPostgres(ctr)
      .withExec(["bun", "run", "test"])
      .withExec(["echo", "All checks passed"])
      .stdout()
  }

  /**
   * Detect changed files between HEAD and the base branch using Dagger's native Git API.
   * Returns the list of changed file paths.
   *
   * Note: The ignore list for gitSource intentionally omits .git (needed for asGit())
   * and ci/ (the Dagger module itself), unlike base() which excludes both. The ci/
   * directory is stripped later via withoutDirectory() before running the pipeline.
   */
  private async detectChangedFiles(gitSource: Directory, baseBranch: string): Promise<string[]> {
    const repo = gitSource.asGit()
    const head = repo.head()
    const base = repo.branch(baseBranch)
    const mergeBase = head.commonAncestor(base)

    const headTree = head.tree({ discardGitDir: true })
    const baseTree = mergeBase.tree({ discardGitDir: true })

    const changeset = headTree.changes(baseTree)
    const added = await changeset.addedPaths()
    const modified = await changeset.modifiedPaths()
    const removed = await changeset.removedPaths()
    return [...added, ...modified, ...removed]
  }

  /**
   * Run the full CI pipeline from a gitSource directory, stripping .git and ci/.
   * Postgres is started before the test step so @vertz/db integration tests work.
   */
  private runFullPipeline(gitSource: Directory): Promise<string> {
    const source = gitSource.withoutDirectory(".git").withoutDirectory("ci")
    const ctr = this.base(source)
      .withExec(["bun", "run", "lint"])
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withExec(["bun", "run", "typecheck"])
    return this.withPostgres(ctr)
      .withExec(["bun", "run", "test"])
      .withExec(["echo", "All checks passed"])
      .stdout()
  }

  /**
   * Detect changed files between HEAD and the base branch using Dagger's native Git API.
   * Returns a newline-separated list of changed file paths, or a message if no files changed.
   *
   * Works both locally (lefthook pre-push) and in CI (GitHub Actions) because
   * it uses Dagger's built-in git support rather than host-specific tools.
   *
   * Usage:
   *   dagger call changed-files                          # compare against main
   *   dagger call changed-files --base-branch develop    # compare against develop
   */
  @func()
  async changedFiles(
    @argument({ defaultPath: "/", ignore: ["node_modules", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo"] })
    gitSource: Directory,
    baseBranch = "main",
  ): Promise<string> {
    const allChanged = await this.detectChangedFiles(gitSource, baseBranch)

    if (allChanged.length === 0) {
      return "No files changed"
    }

    return allChanged.join("\n")
  }

  /**
   * Run CI pipeline with smart skipping -- only runs when source files changed.
   *
   * Compares HEAD against the base branch using Dagger's native Git API to detect
   * which files changed. If only non-source files changed (docs, plans, .claude/, etc.),
   * the expensive lint/build/typecheck/test steps are skipped entirely.
   *
   * Works identically in GitHub Actions and local lefthook pre-push hooks because
   * change detection happens inside the Dagger pipeline, not in the CI platform.
   *
   * Falls back to running the full pipeline if change detection fails (e.g., base branch
   * not found, missing git history, first commit).
   *
   * Usage:
   *   dagger call smart-ci                          # compare against main
   *   dagger call smart-ci --base-branch develop    # compare against develop
   */
  @func()
  async smartCi(
    @argument({ defaultPath: "/", ignore: ["node_modules", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo"] })
    gitSource: Directory,
    baseBranch = "main",
  ): Promise<string> {
    let allChanged: string[]
    try {
      allChanged = await this.detectChangedFiles(gitSource, baseBranch)
    } catch {
      // Change detection failed (missing base branch, shallow clone, first commit, etc.)
      // Fall back to running the full pipeline to avoid silently skipping CI.
      return this.runFullPipeline(gitSource)
    }

    // If no files changed, skip
    if (allChanged.length === 0) {
      return "No changes detected -- skipping CI pipeline.\n"
    }

    // Check if any changed file is a source file
    const sourceChanges = allChanged.filter(isSourcePath)

    if (sourceChanges.length === 0) {
      const skippedFiles = allChanged.join("\n  ")
      return `No source changes detected -- skipping CI pipeline.\n\nChanged files (non-source only):\n  ${skippedFiles}\n`
    }

    // Source files changed -- run the full pipeline
    return this.runFullPipeline(gitSource)
  }
}
