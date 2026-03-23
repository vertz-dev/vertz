/**
 * AOT Manifest Build — Generate AOT compilation manifest at build time.
 *
 * Scans all TSX files in the source directory, runs compileForSSRAot()
 * on each, and collects per-component classification and hole info.
 *
 * Used by the production build pipeline (`buildUI()`) to generate
 * `aot-manifest.json` and log per-component classification stats.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileForSSRAot } from '@vertz/ui-compiler';

export interface AotBuildComponentEntry {
  tier: 'static' | 'data-driven' | 'conditional' | 'runtime-fallback';
  holes: string[];
}

export interface AotBuildManifest {
  components: Record<string, AotBuildComponentEntry>;
  classificationLog: string[];
}

/**
 * Scan all TSX files in srcDir and generate an AOT build manifest.
 */
export function generateAotBuildManifest(srcDir: string): AotBuildManifest {
  const components: Record<string, AotBuildComponentEntry> = {};
  const tsxFiles = collectTsxFiles(srcDir);

  for (const filePath of tsxFiles) {
    try {
      const source = readFileSync(filePath, 'utf-8');
      const result = compileForSSRAot(source, { filename: filePath });

      for (const comp of result.components) {
        components[comp.name] = {
          tier: comp.tier,
          holes: comp.holes,
        };
      }
    } catch {
      // Skip files that fail to compile
    }
  }

  // Generate classification log
  const classificationLog: string[] = [];
  let aotCount = 0;
  let runtimeCount = 0;

  for (const [name, entry] of Object.entries(components)) {
    let line = `${name}: ${entry.tier}`;
    if (entry.holes.length > 0) {
      const holeLabel = entry.holes.length === 1 ? 'hole' : 'holes';
      line += `, ${entry.holes.length} ${holeLabel} (${entry.holes.join(', ')})`;
    }
    classificationLog.push(line);

    if (entry.tier === 'runtime-fallback') {
      runtimeCount++;
    } else {
      aotCount++;
    }
  }

  const total = aotCount + runtimeCount;
  if (total > 0) {
    const pct = Math.round((aotCount / total) * 100);
    classificationLog.push(`Coverage: ${aotCount}/${total} components (${pct}%)`);
  }

  return { components, classificationLog };
}

/** Recursively collect all .tsx files in a directory. */
function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}
