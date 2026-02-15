/**
 * Vertz Dev Command - Phase 1 Implementation
 * 
 * Unified `vertz dev` command that orchestrates the full development workflow:
 * 1. Analyze - runs @vertz/compiler to produce AppIR
 * 2. Generate - runs @vertz/codegen to emit types, route map, DB client
 * 3. Build UI - UI compilation (Vite for now)
 * 4. Serve - dev server with HMR
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import {
  PipelineOrchestrator,
  createPipelineWatcher,
  type PipelineConfig,
  type FileChange,
  type PipelineStage,
} from '../pipeline';
import { findProjectRoot } from '../utils/paths';
import { formatDuration } from '../utils/format';

export interface DevCommandOptions {
  port?: number;
  host?: string;
  open?: boolean;
  typecheck?: boolean;
  noTypecheck?: boolean;
  verbose?: boolean;
}

/**
 * Run the dev command
 */
export async function devAction(options: DevCommandOptions = {}): Promise<void> {
  const {
    port = 3000,
    host = 'localhost',
    open = false,
    typecheck = true,
    verbose = false,
  } = options;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.error('Error: Could not find project root. Are you in a Vertz project?');
    process.exit(1);
  }

  console.log('🚀 Starting Vertz development server...\n');

  // Configure the pipeline
  const pipelineConfig: PipelineConfig = {
    sourceDir: 'src',
    outputDir: '.vertz/generated',
    typecheck,
    autoSyncDb: true,
    open,
    port,
    host,
  };

  // Create the pipeline orchestrator
  const orchestrator = new PipelineOrchestrator(pipelineConfig);

  // Track if we should continue
  let isRunning = true;
  let viteProcess: ChildProcess | null = null;

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n\n👋 Shutting down...');
    isRunning = false;
    
    if (viteProcess) {
      viteProcess.kill('SIGTERM');
    }
    
    await orchestrator.dispose();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Step 1: Initial analysis and codegen
    console.log('📦 Running initial pipeline...');
    const initialResult = await orchestrator.runFull();
    
    if (!initialResult.success) {
      console.error('\n❌ Initial pipeline failed:');
      for (const stage of initialResult.stages) {
        if (!stage.success && stage.error) {
          console.error(`  - ${stage.stage}: ${stage.error.message}`);
        }
      }
      console.log('\n💡 Try fixing the errors above and the watcher will retry.');
    } else {
      if (verbose) {
        console.log('\n✅ Initial pipeline complete:');
        for (const stage of initialResult.stages) {
          console.log(`  - ${stage.stage}: ${stage.output} (${formatDuration(stage.durationMs)})`);
        }
      }
    }

    // Step 2: Start file watcher for incremental builds
    console.log('\n👀 Watching for file changes...');
    
    const watcher = createPipelineWatcher({
      dir: join(projectRoot, 'src'),
      debounceMs: 100,
      onChange: async (changes: FileChange[]) => {
        if (!isRunning) return;
        
        // Determine which stages to run
        const stages = getStagesForFileChanges(changes);
        
        if (verbose) {
          console.log(`\n🔄 File change detected: ${changes.map(c => c.path).join(', ')}`);
          console.log(`   Running stages: ${stages.join(', ')}`);
        }
        
        // Run the affected stages
        const result = await orchestrator.runStages(stages);
        
        if (!result.success) {
          console.error('\n❌ Pipeline update failed:');
          for (const stage of result.stages) {
            if (!stage.success && stage.error) {
              console.error(`  - ${stage.stage}: ${stage.error.message}`);
            }
          }
          console.log('\n💡 Try fixing the errors above.');
        } else if (verbose) {
          for (const stage of result.stages) {
            console.log(`  ✓ ${stage.stage}: ${stage.output}`);
          }
        }
      },
    });

    // Step 3: Start Vite dev server
    // Note: For now, we delegate to Vite. In Phase 3+, we'll use our own dev server.
    console.log(`\n🌐 Starting Vite dev server on http://${host}:${port}...`);
    
    viteProcess = spawn('npx', ['vite', '--port', String(port), '--host', host], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        // Pass the generated output dir to Vite
        VERTZ_GENERATED_DIR: pipelineConfig.outputDir,
      },
    });

    viteProcess.on('close', (code) => {
      if (isRunning && code !== 0) {
        console.log(`\n⚠️ Vite process exited with code ${code}`);
      }
      shutdown();
    });

  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
    await shutdown();
    process.exit(1);
  }
}

/**
 * Determine which pipeline stages to run based on file changes
 * This is the smart dispatch logic
 */
function getStagesForFileChanges(changes: FileChange[]): PipelineStage[] {
  const stages = new Set<PipelineStage>();
  
  for (const change of changes) {
    const path = change.path.toLowerCase();
    
    // Domain, module, service, route changes → analyze + codegen
    if (path.includes('.domain.ts') || 
        path.includes('.module.ts') || 
        path.includes('.service.ts') ||
        path.includes('.route.ts')) {
      stages.add('analyze');
      stages.add('codegen');
    }
    // Schema changes → codegen only
    else if (path.includes('.schema.ts')) {
      stages.add('codegen');
    }
    // Component changes → build-ui only
    else if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
      stages.add('build-ui');
    }
    // Config changes → full rebuild
    else if (path.includes('vertz.config') || path.includes('vite.config')) {
      stages.add('analyze');
      stages.add('codegen');
      stages.add('build-ui');
    }
    // Default → build-ui
    else {
      stages.add('build-ui');
    }
  }
  
  // Always analyze before codegen
  if (stages.has('codegen') && !stages.has('analyze')) {
    stages.add('analyze');
  }
  
  return Array.from(stages);
}

/**
 * Register the dev command with a Commander program
 */
export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description('Start development server with hot reload (unified pipeline)')
    .option('-p, --port <port>', 'Server port', '3000')
    .option('--host <host>', 'Server host', 'localhost')
    .option('--open', 'Open browser on start')
    .option('--no-typecheck', 'Disable background type checking')
    .option('-v, --verbose', 'Verbose output')
    .action(async (opts) => {
      await devAction({
        port: parseInt(opts.port, 10),
        host: opts.host,
        open: opts.open,
        typecheck: opts.typecheck !== false && !opts.noTypecheck,
        verbose: opts.verbose,
      });
    });
}
