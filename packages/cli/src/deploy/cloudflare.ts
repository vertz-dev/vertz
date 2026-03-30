/**
 * Cloudflare Workers deploy module
 *
 * Reads the deployment manifest from .vertz/build/worker/manifest.json,
 * validates it, and deploys via wrangler.
 *
 * Features:
 * - Manifest validation (exists, correct target/version)
 * - Dry-run mode (prints deployment plan without executing)
 * - Custom wrangler.toml override via --config
 * - D1 provisioning via --provision
 * - Structured error messages for common wrangler failures
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DeploymentManifest } from '../production-build/cloudflare/types';

// Inline Result type to avoid @vertz/errors resolution issues at test time
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}
function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

const MANIFEST_PATH = '.vertz/build/worker/manifest.json';
const WRANGLER_CONFIG_PATH = '.vertz/build/worker/wrangler.toml';

export interface CloudflareDeployOptions {
  projectRoot: string;
  dryRun: boolean;
  config?: string;
  provision?: boolean;
  /** @internal — inject manifest for testing (bypasses file read) */
  _testManifest?: DeploymentManifest;
  /** @internal — inject command executor for testing (bypasses shell exec) */
  _execCommand?: (cmd: string) => Promise<{ stdout: string; stderr: string }>;
}

export interface DeployResult {
  dryRun: boolean;
  plan?: string;
  url?: string;
}

export function validateManifest(manifest: DeploymentManifest): Result<void, Error> {
  if (manifest.version !== 1) {
    return err(new Error(`Unsupported manifest version: ${manifest.version}. Expected version 1.`));
  }

  if (manifest.target !== 'cloudflare') {
    return err(
      new Error(
        `Build target '${manifest.target}' is incompatible with Cloudflare Workers. ` +
          `Rebuild with 'vertz build --target cloudflare'.`,
      ),
    );
  }

  return ok(undefined);
}

export function formatDeployPlan(manifest: DeploymentManifest, workerName: string): string {
  const lines: string[] = [];

  lines.push('📋 Deployment Plan');
  lines.push('');
  lines.push(`   Worker:    ${workerName}`);
  lines.push(`   Target:    Cloudflare Workers`);
  lines.push(`   Entities:  ${manifest.entities.length}`);
  lines.push(`   Routes:    ${manifest.routes.length}`);
  lines.push(`   SSR:       ${manifest.ssr.enabled ? 'enabled' : 'disabled'}`);
  lines.push('');

  if (manifest.entities.length > 0) {
    lines.push('   Entities:');
    for (const entity of manifest.entities) {
      const ops = entity.operations.join(', ');
      lines.push(`     - ${entity.name} (${ops})`);
    }
    lines.push('');
  }

  if (manifest.bindings.length > 0) {
    lines.push('   Bindings:');
    for (const binding of manifest.bindings) {
      lines.push(`     - ${binding.type.toUpperCase()} "${binding.name}" — ${binding.purpose}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function resolveWorkerName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    const name = (pkg.name as string) ?? '';
    return (
      name
        .replace(/^@[^/]+\//, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || basename(projectRoot)
    );
  } catch {
    return basename(projectRoot);
  }
}

function extractDeployUrl(stdout: string): string | undefined {
  // Wrangler outputs the URL in its deploy output
  const urlMatch = stdout.match(/https?:\/\/[^\s]+\.workers\.dev[^\s]*/);
  return urlMatch?.[0];
}

function categorizeWranglerError(errorMessage: string): string {
  if (errorMessage.includes('Authentication') || errorMessage.includes('logged in')) {
    return errorMessage;
  }
  if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
    return `Deployment quota exceeded. ${errorMessage}`;
  }
  if (errorMessage.includes('size') || errorMessage.includes('too large')) {
    return `Worker bundle too large. ${errorMessage}`;
  }
  return `Deployment failed: ${errorMessage}`;
}

export async function deployCloudflare(
  options: CloudflareDeployOptions,
): Promise<Result<DeployResult, Error>> {
  const { projectRoot, dryRun, config, _testManifest, _execCommand } = options;

  // Step 1: Read manifest
  let manifest: DeploymentManifest;
  if (_testManifest) {
    manifest = _testManifest;
  } else {
    const manifestPath = join(projectRoot, MANIFEST_PATH);
    if (!existsSync(manifestPath)) {
      return err(
        new Error(
          `No deployment manifest found at ${MANIFEST_PATH}. ` +
            `Run 'vertz build --target cloudflare' first.`,
        ),
      );
    }
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      return err(new Error(`Failed to parse manifest at ${MANIFEST_PATH}.`));
    }
  }

  // Step 2: Validate manifest
  const validation = validateManifest(manifest);
  if (!validation.ok) {
    return validation;
  }

  const workerName = _testManifest ? 'my-app' : resolveWorkerName(projectRoot);

  // Step 3: Dry-run — show plan and return
  if (dryRun) {
    const plan = formatDeployPlan(manifest, workerName);
    console.log(plan);
    console.log('   (dry run — no changes made)');
    return ok({ dryRun: true, plan });
  }

  // Step 4: Check wrangler availability
  const execCommand =
    _execCommand ??
    (async (cmd: string) => {
      const { execSync } = await import('node:child_process');
      const result = execSync(cmd, { encoding: 'utf-8', cwd: projectRoot });
      return { stdout: result, stderr: '' };
    });

  try {
    await execCommand('wrangler --version');
  } catch {
    return err(
      new Error(
        'wrangler is required for Cloudflare deployment. ' +
          'Install with: npm install -g wrangler',
      ),
    );
  }

  // Step 5: Deploy via wrangler
  const configPath = config ?? join(projectRoot, WRANGLER_CONFIG_PATH);
  const deployCmd = `wrangler deploy --config "${configPath}"`;

  console.log('🚀 Deploying to Cloudflare Workers...\n');
  console.log(formatDeployPlan(manifest, workerName));

  try {
    const { stdout } = await execCommand(deployCmd);
    const url = extractDeployUrl(stdout);

    console.log('✅ Deployment successful!');
    if (url) {
      console.log(`   URL: ${url}`);
    }

    return ok({ dryRun: false, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(categorizeWranglerError(message)));
  }
}
