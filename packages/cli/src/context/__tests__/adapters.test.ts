import { describe, expect, it } from 'bun:test';
import type { ContextBlock } from '../types';
import { claudeAdapter } from '../adapters/claude';
import { cursorAdapter } from '../adapters/cursor';
import { genericAdapter } from '../adapters/generic';
import { copilotAdapter } from '../adapters/copilot';

const blocks: ContextBlock[] = [
  {
    id: 'overview',
    title: 'Overview',
    category: 'overview',
    content: 'A full-stack app.',
    priority: 1,
  },
  {
    id: 'api-conventions',
    title: 'API Conventions',
    category: 'api',
    content: 'Use entity() for CRUD.',
    priority: 1,
  },
  {
    id: 'ui-conventions',
    title: 'UI Conventions',
    category: 'ui',
    content: 'Use css() for styling.',
    priority: 2,
  },
  {
    id: 'cli-commands',
    title: 'CLI Commands',
    category: 'cli',
    content: 'vertz dev, vertz inspect',
    priority: 1,
  },
];

// ── Generic adapter (AGENTS.md) ─────────────────────────────

describe('genericAdapter', () => {
  it('generates AGENTS.md with all blocks', () => {
    const files = genericAdapter.generate(blocks);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('AGENTS.md');
  });

  it('includes all block content sorted by priority', () => {
    const files = genericAdapter.generate(blocks);
    const content = files[0].content;

    expect(content).toContain('Overview');
    expect(content).toContain('API Conventions');
    expect(content).toContain('UI Conventions');
    expect(content).toContain('CLI Commands');
  });

  it('sorts blocks by priority (1 before 2)', () => {
    const files = genericAdapter.generate(blocks);
    const content = files[0].content;

    const overviewIdx = content.indexOf('Overview');
    const uiIdx = content.indexOf('UI Conventions');
    expect(overviewIdx).toBeLessThan(uiIdx);
  });
});

// ── Claude adapter (CLAUDE.md + .claude/rules/) ─────────────

describe('claudeAdapter', () => {
  it('generates CLAUDE.md and .claude/rules/ files', () => {
    const files = claudeAdapter.generate(blocks);

    const paths = files.map((f) => f.path);
    expect(paths).toContain('CLAUDE.md');
  });

  it('puts overview and cli blocks in CLAUDE.md', () => {
    const files = claudeAdapter.generate(blocks);
    const claudeMd = files.find((f) => f.path === 'CLAUDE.md')!;

    expect(claudeMd.content).toContain('Overview');
    expect(claudeMd.content).toContain('CLI Commands');
  });

  it('puts category-specific blocks in .claude/rules/', () => {
    const files = claudeAdapter.generate(blocks);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('.claude/rules/api.md');
    expect(paths).toContain('.claude/rules/ui.md');
  });

  it('api rules file contains API content', () => {
    const files = claudeAdapter.generate(blocks);
    const apiRules = files.find((f) => f.path === '.claude/rules/api.md')!;

    expect(apiRules.content).toContain('API Conventions');
    expect(apiRules.content).toContain('Use entity() for CRUD.');
  });
});

// ── Cursor adapter (.cursorrules) ───────────────────────────

describe('cursorAdapter', () => {
  it('generates single .cursorrules file', () => {
    const files = cursorAdapter.generate(blocks);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('.cursorrules');
  });

  it('includes all blocks in one file', () => {
    const files = cursorAdapter.generate(blocks);
    const content = files[0].content;

    expect(content).toContain('Overview');
    expect(content).toContain('API Conventions');
    expect(content).toContain('UI Conventions');
    expect(content).toContain('CLI Commands');
  });
});

// ── Copilot adapter (.github/copilot-instructions.md) ───────

describe('copilotAdapter', () => {
  it('generates .github/copilot-instructions.md', () => {
    const files = copilotAdapter.generate(blocks);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('.github/copilot-instructions.md');
  });

  it('includes all blocks', () => {
    const files = copilotAdapter.generate(blocks);
    const content = files[0].content;

    expect(content).toContain('Overview');
    expect(content).toContain('API Conventions');
  });
});
