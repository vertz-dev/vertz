/**
 * Domain generation command for DB client codegen.
 * 
 * Discovers domain files and generates typed DB client.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { generateClient, type DomainDefinition } from '@vertz/db';

export interface DomainGenOptions {
  dryRun?: boolean;
  sourceDir?: string;
}

interface DomainHash {
  file: string;
  hash: string;
}

/**
 * Find all domain files in the domains directory
 */
function findDomainFiles(cwd: string): string[] {
  const domainsDir = join(cwd, 'domains');
  
  if (!existsSync(domainsDir)) {
    return [];
  }
  
  const files = readdirSync(domainsDir);
  return files
    .filter(f => f.endsWith('.domain.ts'))
    .map(f => join(domainsDir, f));
}

/**
 * Compute hash of domain files content
 */
function computeDomainHash(files: string[]): string {
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const content = readFileSync(file, 'utf-8');
    hash.update(content);
  }
  return hash.digest('hex');
}

/**
 * Check if generation should be skipped based on hash
 */
function shouldSkipGeneration(cwd: string, currentHash: string): boolean {
  const hashFile = join(cwd, '.vertz', 'generated', '.domain-hash');
  
  if (!existsSync(hashFile)) {
    return false;
  }
  
  try {
    const storedHash = readFileSync(hashFile, 'utf-8').trim();
    return storedHash === currentHash;
  } catch {
    return false;
  }
}

/**
 * Save the domain hash for incremental generation
 */
function saveDomainHash(cwd: string, hash: string): void {
  const dir = join(cwd, '.vertz', 'generated');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, '.domain-hash'), hash);
}

/**
 * Load domain definitions from files using jiti
 */
async function loadDomainDefinitions(cwd: string, files: string[]): Promise<DomainDefinition[]> {
  // Dynamic import jiti for module resolution
  const { createJiti } = await import('jiti');
  const jitiImport = createJiti(cwd);
  
  const domains: DomainDefinition[] = [];
  
  for (const file of files) {
    try {
      const mod = jitiImport(file);
      // Look for exported domain definitions
      const exports = mod.__esModule ? mod.default : mod;
      
      if (exports) {
        // Handle both default export and named exports
        const domainExports = Array.isArray(exports) ? exports : [exports];
        for (const exp of domainExports) {
          if (exp && exp.name && exp.fields) {
            domains.push(exp);
          }
        }
      }
    } catch (err) {
      console.warn(`Warning: Failed to load domain file ${file}:`, err);
    }
  }
  
  return domains;
}

/**
 * Generate domain action - discovers and generates DB client
 */
export async function generateDomainAction(options: DomainGenOptions): Promise<void> {
  const cwd = process.cwd();
  const dryRun = options.dryRun || false;
  
  // Find domain files
  const domainFiles = findDomainFiles(cwd);
  
  if (domainFiles.length === 0) {
    console.log('No domain files found in domains/ directory');
    return;
  }
  
  console.log(`Found ${domainFiles.length} domain file(s)`);
  
  // Compute hash of domain files
  const domainHash = computeDomainHash(domainFiles);
  
  // Check if we should skip generation
  if (shouldSkipGeneration(cwd, domainHash)) {
    console.log('Skipping generation - domains unchanged');
    return;
  }
  
  console.log('Generating DB client...');
  
  // Load domain definitions
  const domains = await loadDomainDefinitions(cwd, domainFiles);
  
  if (domains.length === 0) {
    console.log('No valid domain definitions found');
    return;
  }
  
  // Generate client code
  const clientCode = generateClient(domains);
  
  // Output path
  const outputDir = join(cwd, '.vertz', 'generated');
  const outputFile = join(outputDir, 'db-client.ts');
  
  if (dryRun) {
    console.log('Dry run - would write to:', outputFile);
    console.log(clientCode);
    return;
  }
  
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  // Write the generated code
  writeFileSync(outputFile, clientCode);
  
  // Save hash for incremental generation
  saveDomainHash(cwd, domainHash);
  
  console.log('DB client generated successfully');
}
