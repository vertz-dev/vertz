/**
 * Vertz CI pipeline — runs lint, build, typecheck, and tests in a Bun container.
 *
 * Run locally: dagger call ci
 * Run a single check: dagger call lint / dagger call build / dagger call typecheck / dagger call test
 * Debug shell: dagger call base terminal
 */
import { dag, Container, Directory, object, func, argument } from "@dagger.io/dagger"

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
   */
  @func()
  async test(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withExec(["bun", "test"])
      .withExec(["echo", "Tests passed"])
      .stdout()
  }

  /**
   * Run the full CI pipeline: lint, build, typecheck, test.
   */
  @func()
  async ci(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "*.tsbuildinfo", "ci"] })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec(["bun", "run", "lint"])
      .withExec(["bun", "run", "--filter", "*", "build"])
      .withExec(["bun", "run", "typecheck"])
      .withExec(["bun", "test"])
      .withExec(["echo", "All checks passed"])
      .stdout()
  }
}
