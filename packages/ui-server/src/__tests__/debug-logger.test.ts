import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDebugLogger } from '../debug-logger';

describe('createDebugLogger', () => {
  let logDir: string;

  beforeEach(() => {
    logDir = join(tmpdir(), `vertz-debug-test-${Date.now()}`);
    mkdirSync(logDir, { recursive: true });
    delete process.env.VERTZ_DEBUG;
  });

  afterEach(() => {
    delete process.env.VERTZ_DEBUG;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('returns a no-op logger when VERTZ_DEBUG is unset', () => {
    const logger = createDebugLogger(logDir);

    logger.log('plugin', 'test message');

    const logFile = join(logDir, 'debug.log');
    expect(existsSync(logFile)).toBe(false);
  });

  it('writes NDJSON to log file when category is enabled', () => {
    process.env.VERTZ_DEBUG = 'plugin';
    const logger = createDebugLogger(logDir);

    logger.log('plugin', 'onLoad', { file: 'src/app.tsx', bytes: 1234 });

    const logFile = join(logDir, 'debug.log');
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, 'utf-8').trim();
    const parsed = JSON.parse(content);
    expect(parsed.cat).toBe('plugin');
    expect(parsed.msg).toBe('onLoad');
    expect(parsed.file).toBe('src/app.tsx');
    expect(parsed.bytes).toBe(1234);
  });

  it('filters by category — ignores non-enabled categories', () => {
    process.env.VERTZ_DEBUG = 'plugin';
    const logger = createDebugLogger(logDir);

    logger.log('ssr', 'render-start', { url: '/' });

    const logFile = join(logDir, 'debug.log');
    const content = readFileSync(logFile, 'utf-8').trim();
    expect(content).toBe('');
    expect(logger.isEnabled('plugin')).toBe(true);
    expect(logger.isEnabled('ssr')).toBe(false);
  });

  it('enables all categories with VERTZ_DEBUG=1', () => {
    process.env.VERTZ_DEBUG = '1';
    const logger = createDebugLogger(logDir);

    logger.log('plugin', 'onLoad');
    logger.log('ssr', 'render-start');
    logger.log('watcher', 'file-changed');
    logger.log('ws', 'client-connected');

    const logFile = join(logDir, 'debug.log');
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0]).cat).toBe('plugin');
    expect(JSON.parse(lines[1]).cat).toBe('ssr');
    expect(JSON.parse(lines[2]).cat).toBe('watcher');
    expect(JSON.parse(lines[3]).cat).toBe('ws');
  });

  it('enables multiple categories with comma-separated values', () => {
    process.env.VERTZ_DEBUG = 'plugin,ssr';
    const logger = createDebugLogger(logDir);

    logger.log('plugin', 'onLoad');
    logger.log('ssr', 'render-start');
    logger.log('watcher', 'file-changed');

    const logFile = join(logDir, 'debug.log');
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).cat).toBe('plugin');
    expect(JSON.parse(lines[1]).cat).toBe('ssr');
  });

  it('truncates log file on createDebugLogger() call', () => {
    process.env.VERTZ_DEBUG = '1';

    // Create logger and write some entries
    const logger1 = createDebugLogger(logDir);
    logger1.log('plugin', 'first');
    logger1.log('ssr', 'second');

    // Create a new logger — should truncate
    const logger2 = createDebugLogger(logDir);
    logger2.log('watcher', 'third');

    const logFile = join(logDir, 'debug.log');
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).cat).toBe('watcher');
  });

  it('each NDJSON line is parseable via JSON.parse()', () => {
    process.env.VERTZ_DEBUG = '1';
    const logger = createDebugLogger(logDir);

    logger.log('plugin', 'onLoad', { file: 'src/app.tsx', bytes: 1234 });
    logger.log('ssr', 'render-done', { url: '/', durationMs: 42, htmlBytes: 2300 });

    const logFile = join(logDir, 'debug.log');
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const entry1 = JSON.parse(lines[0]);
    expect(entry1).toEqual({ cat: 'plugin', msg: 'onLoad', file: 'src/app.tsx', bytes: 1234 });
    const entry2 = JSON.parse(lines[1]);
    expect(entry2).toEqual({
      cat: 'ssr',
      msg: 'render-done',
      url: '/',
      durationMs: 42,
      htmlBytes: 2300,
    });
  });
});
