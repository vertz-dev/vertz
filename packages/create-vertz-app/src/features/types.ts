/**
 * A composable unit of scaffold functionality.
 * Features generate files and contribute to shared package.json.
 */
export interface Feature {
  /** Unique identifier for this feature */
  name: string;
  /** Names of features this feature depends on */
  dependencies: string[];
  /** Generate files for this feature */
  files(ctx: FeatureContext): FileEntry[];
  /** Contributions to the shared package.json — static object or context-aware function */
  packages?: PackageContributions | ((ctx: FeatureContext) => PackageContributions);
}

/**
 * Context provided to each feature during composition.
 */
export interface FeatureContext {
  /** Name of the project being scaffolded */
  projectName: string;
  /** All resolved feature names in this composition */
  features: string[];
  /** Check if a specific feature is present in this composition */
  hasFeature(name: string): boolean;
}

/**
 * A file to be written to disk.
 */
export interface FileEntry {
  /** Path relative to project root */
  path: string;
  /** File content */
  content: string;
}

/**
 * Contributions a feature makes to the shared package.json.
 */
export interface PackageContributions {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  imports?: Record<string, string>;
}

/**
 * Result of composing multiple features.
 */
export interface ComposeResult {
  /** All files to write */
  files: FileEntry[];
  /** Merged package.json fields */
  packageJson: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
    imports?: Record<string, string>;
  };
}
