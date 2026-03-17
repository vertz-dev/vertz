#!/usr/bin/env bun
/**
 * Vertz Issue Orchestrator
 *
 * Picks up GitHub issues, labels them in-progress, spawns Claude Code agents
 * in git worktrees, and monitors their progress.
 *
 * Usage:
 *   bun run src/orchestrator.ts                     # Auto-pick top N issues
 *   bun run src/orchestrator.ts --issues 1381,1380  # Specific issues
 *   bun run src/orchestrator.ts --dry-run            # Show what would happen
 *   bun run src/orchestrator.ts --status             # Show running agents
 *   bun run src/orchestrator.ts --max 3              # Override concurrency
 *   bun run src/orchestrator.ts --tmux               # Open tmux panes (interactive)
 */

import { fetchEligibleIssues, fetchIssue, addLabel, removeLabel, type Issue } from './github';
import { buildPrompt } from './prompt';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ─── Config ─────────────────────────────────────────────────────────────────

const REPO_DIR = findRepoRoot();
const LOGS_DIR = resolve(dirname(import.meta.dir), 'logs');
const STATE_FILE = resolve(dirname(import.meta.dir), 'state.json');
const DEFAULT_MAX_CONCURRENT = 8;

function findRepoRoot(): string {
  // Walk up from this file to find the .git directory
  let dir = dirname(import.meta.dir);
  while (dir !== '/') {
    if (existsSync(resolve(dir, '.git'))) return dir;
    dir = dirname(dir);
  }
  // Fallback: assume we're in .context/orchestrator/src within the repo
  return resolve(dirname(import.meta.dir), '..', '..', '..');
}

// ─── CLI Parsing ────────────────────────────────────────────────────────────

interface CliArgs {
  mode: 'run' | 'dry-run' | 'status';
  issues?: number[];
  max: number;
  tmux: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    mode: 'run',
    max: DEFAULT_MAX_CONCURRENT,
    tmux: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        result.mode = 'dry-run';
        break;
      case '--status':
        result.mode = 'status';
        break;
      case '--tmux':
        result.tmux = true;
        break;
      case '--issues': {
        const next = args[++i];
        if (!next) throw new Error('--issues requires a comma-separated list of issue numbers');
        result.issues = next.split(',').map(Number);
        break;
      }
      case '--max': {
        const next = args[++i];
        if (!next) throw new Error('--max requires a number');
        result.max = parseInt(next, 10);
        break;
      }
      default:
        if (!args[i].startsWith('-')) {
          // Treat as issue numbers
          result.issues = args[i].split(',').map(Number);
        }
    }
  }

  return result;
}

// ─── State Management ───────────────────────────────────────────────────────

interface AgentState {
  issueNumber: number;
  issueTitle: string;
  pid: number;
  startedAt: string;
  logFile: string;
  status: 'running' | 'completed' | 'failed';
}

interface OrchestratorState {
  agents: AgentState[];
}

function loadState(): OrchestratorState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(Bun.file(STATE_FILE).textSync?.() ?? '{"agents":[]}');
    }
  } catch {
    // corrupt state, start fresh
  }
  return { agents: [] };
}

async function saveState(state: OrchestratorState): Promise<void> {
  await Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Agent Spawning ─────────────────────────────────────────────────────────

async function spawnAgent(
  issue: Issue,
  opts: { tmux: boolean },
): Promise<AgentState> {
  const prompt = buildPrompt(issue);
  const logFile = resolve(LOGS_DIR, `issue-${issue.number}.log`);
  const timestamp = new Date().toISOString();

  console.log(`\n  Spawning agent for #${issue.number}: ${issue.title}`);
  console.log(`  Log: ${logFile}`);

  // Build claude command
  // Use --dangerously-skip-permissions since agents are fully autonomous
  // Use --output-format stream-json for real-time log streaming
  const cmd: string[] = [
    'claude',
    '--print',
    '--worktree',
    '--dangerously-skip-permissions',
    '--verbose',
    '--output-format', 'stream-json',
  ];

  if (opts.tmux) {
    // Replace --print with --tmux for interactive mode
    const printIdx = cmd.indexOf('--print');
    cmd.splice(printIdx, 1);
    // Remove stream-json too (not compatible with tmux)
    const fmtIdx = cmd.indexOf('--output-format');
    if (fmtIdx >= 0) cmd.splice(fmtIdx, 2);
    cmd.push('--tmux');
  }

  // Pass the prompt as the positional argument
  cmd.push(prompt);

  const logFileHandle = Bun.file(logFile);
  const writer = logFileHandle.writer();

  // Write header to log
  const header = `=== Vertz Orchestrator Agent ===
Issue: #${issue.number} — ${issue.title}
Started: ${timestamp}
Repo: ${REPO_DIR}
${'='.repeat(50)}

`;
  writer.write(header);
  writer.flush();

  // Build a clean env — remove CLAUDECODE to allow nested sessions
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const proc = Bun.spawn(cmd, {
    cwd: REPO_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
    env: cleanEnv,
  });

  // Stream stdout (NDJSON) and stderr to log file
  const streamToLog = async (stream: ReadableStream<Uint8Array>, isStdout: boolean) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        writer.write(text);
        writer.flush();

        if (isStdout) {
          // Parse NDJSON stream for progress indicators
          buffer += text;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // keep incomplete line in buffer
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              // Show tool use events as progress
              if (event.type === 'assistant' && event.message?.content) {
                for (const block of event.message.content) {
                  if (block.type === 'tool_use') {
                    const name = block.name;
                    const summary = name === 'Bash'
                      ? block.input?.command?.slice(0, 60)
                      : name === 'Edit' || name === 'Write'
                        ? block.input?.file_path?.split('/').pop()
                        : name === 'Read'
                          ? block.input?.file_path?.split('/').pop()
                          : '';
                    process.stdout.write(`  [#${issue.number}] ${name}: ${summary}\n`);
                  } else if (block.type === 'text' && block.text?.length > 0) {
                    // Show first 80 chars of assistant text
                    const preview = block.text.slice(0, 80).replace(/\n/g, ' ');
                    process.stdout.write(`  [#${issue.number}] ${preview}\n`);
                  }
                }
              }
            } catch {
              // Not JSON, just log raw
              const preview = line.slice(0, 100);
              if (preview.trim()) {
                process.stdout.write(`  [#${issue.number}] ${preview}\n`);
              }
            }
          }
        } else {
          // stderr — show as-is
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            process.stdout.write(`  [#${issue.number}] ERR: ${line.slice(0, 100)}\n`);
          }
        }
      }
    } catch {
      // stream closed
    }
  };

  // Don't await these — they run in background
  streamToLog(proc.stdout as ReadableStream<Uint8Array>, true);
  streamToLog(proc.stderr as ReadableStream<Uint8Array>, false);

  return {
    issueNumber: issue.number,
    issueTitle: issue.title,
    pid: proc.pid,
    startedAt: timestamp,
    logFile,
    status: 'running',
  };
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function showStatus(): Promise<void> {
  const state = loadState();
  if (state.agents.length === 0) {
    console.log('No agents running.');
    return;
  }

  console.log('\nActive agents:\n');
  for (const agent of state.agents) {
    // Check if process is still running
    let alive = false;
    try {
      process.kill(agent.pid, 0);
      alive = true;
    } catch {
      alive = false;
    }

    const status = alive ? 'RUNNING' : agent.status === 'completed' ? 'DONE' : 'STOPPED';
    const elapsed = Math.round((Date.now() - new Date(agent.startedAt).getTime()) / 1000 / 60);

    console.log(`  #${agent.issueNumber} [${status}] ${agent.issueTitle}`);
    console.log(`    PID: ${agent.pid} | Elapsed: ${elapsed}min | Log: ${agent.logFile}`);
    console.log();
  }
}

async function dryRun(issues: Issue[]): Promise<void> {
  console.log('\n  DRY RUN — would process these issues:\n');
  for (const issue of issues) {
    const labels = issue.labels.map((l) => l.name).join(', ') || 'none';
    console.log(`  #${issue.number}: ${issue.title}`);
    console.log(`    Labels: ${labels}`);
    console.log();
  }
}

async function run(issues: Issue[], opts: { tmux: boolean }): Promise<void> {
  mkdirSync(LOGS_DIR, { recursive: true });

  const state = loadState();
  const agents: AgentState[] = [];
  const processes: Array<{ proc: ReturnType<typeof Bun.spawn>; issue: Issue; agent: AgentState }> = [];

  console.log(`\nStarting ${issues.length} agent(s)...\n`);

  // Label all issues as in-progress FIRST (claim them)
  for (const issue of issues) {
    console.log(`  Labeling #${issue.number} as in-progress...`);
    await addLabel(issue.number, 'in-progress');
  }

  // Spawn all agents
  for (const issue of issues) {
    const agent = await spawnAgent(issue, opts);
    agents.push(agent);
  }

  // Save state
  state.agents = [...state.agents.filter((a) => a.status === 'running'), ...agents];
  await saveState(state);

  if (opts.tmux) {
    console.log('\n  Agents launched in tmux sessions.');
    console.log('  Use `tmux ls` to see sessions, `tmux attach -t <name>` to watch.');
    console.log('  Run `bun run src/orchestrator.ts --status` to check progress.\n');
    return; // tmux sessions are interactive, don't wait
  }

  console.log(`\n  All agents spawned. Waiting for completion...`);
  console.log(`  Tail logs with: tail -f ${LOGS_DIR}/issue-<number>.log\n`);

  // Wait for all processes to complete
  // Note: we don't have direct process handles from the spawn above
  // because we stream output. Let's use a polling approach on PID.
  const pending = new Set(agents.map((a) => a.issueNumber));

  while (pending.size > 0) {
    await Bun.sleep(5000); // check every 5 seconds

    for (const agent of agents) {
      if (!pending.has(agent.issueNumber)) continue;

      let alive = false;
      try {
        process.kill(agent.pid, 0);
        alive = true;
      } catch {
        alive = false;
      }

      if (!alive) {
        pending.delete(agent.issueNumber);
        // Check if a PR was created and is mergeable
        const prCheck = Bun.spawn(
          ['gh', 'pr', 'list', '--repo', 'vertz-dev/vertz', '--state', 'open',
           '--search', `#${agent.issueNumber}`, '--json', 'number,url,mergeable', '--limit', '1'],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        const prText = await new Response(prCheck.stdout).text();
        await prCheck.exited;

        let prUrl = '';
        let mergeable = '';
        try {
          const prs = JSON.parse(prText);
          if (prs.length > 0) {
            prUrl = prs[0].url;
            mergeable = prs[0].mergeable;
          }
        } catch { /* ignore */ }

        if (prUrl && mergeable === 'MERGEABLE') {
          // PR is clean and mergeable — swap in-progress for ready-for-review
          console.log(`\n  #${agent.issueNumber} COMPLETED — PR: ${prUrl} (MERGEABLE)`);
          agent.status = 'completed';
          await removeLabel(agent.issueNumber, 'in-progress');
          await addLabel(agent.issueNumber, 'ready-for-review');
        } else if (prUrl) {
          // PR exists but has conflicts or CI issues
          console.log(`\n  #${agent.issueNumber} PR CREATED but not mergeable (${mergeable}) — PR: ${prUrl}`);
          agent.status = 'completed';
          // Keep in-progress — needs attention
        } else {
          // No PR at all
          console.log(`\n  #${agent.issueNumber} FINISHED (no PR found — check log: ${agent.logFile})`);
          agent.status = 'failed';
          await removeLabel(agent.issueNumber, 'in-progress');
        }
      }
    }
  }

  // Update state
  await saveState(state);
  console.log('\n  All agents finished.\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('');
  console.log('  Vertz Issue Orchestrator');
  console.log('  ========================');

  if (args.mode === 'status') {
    return showStatus();
  }

  // Resolve issues
  let issues: Issue[];

  if (args.issues) {
    // Fetch specific issues
    console.log(`\n  Fetching ${args.issues.length} specified issue(s)...`);
    issues = await Promise.all(args.issues.map(fetchIssue));
  } else {
    // Auto-pick by priority
    console.log('\n  Fetching eligible issues...');
    const eligible = await fetchEligibleIssues();
    issues = eligible.slice(0, args.max);

    if (issues.length === 0) {
      console.log('  No eligible issues found (all in-progress, blocked, or none open).');
      return;
    }

    console.log(`  Found ${eligible.length} eligible, picking top ${issues.length}:`);
  }

  for (const issue of issues) {
    const labels = issue.labels.map((l) => l.name).join(', ') || 'none';
    console.log(`    #${issue.number}: ${issue.title} [${labels}]`);
  }

  if (args.mode === 'dry-run') {
    return dryRun(issues);
  }

  await run(issues, { tmux: args.tmux });
}

main().catch((err) => {
  console.error('\n  Fatal:', err.message);
  process.exit(1);
});
