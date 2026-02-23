import { describe, expect, it, vi } from 'vitest';
import { prompt } from '../prompt';
import { symbols } from '../theme';

describe('prompt.intro', () => {
  it('writes intro title to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prompt.intro('my-app');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('my-app');
    writeSpy.mockRestore();
  });
});

describe('prompt.outro', () => {
  it('writes outro message to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prompt.outro('Done!');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Done!');
    writeSpy.mockRestore();
  });
});

describe('prompt.log', () => {
  it('log.info writes info symbol', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prompt.log.info('info message');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain(symbols.info);
    expect(output).toContain('info message');
    writeSpy.mockRestore();
  });

  it('log.warn writes warning symbol', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prompt.log.warn('warning message');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain(symbols.warning);
    writeSpy.mockRestore();
  });

  it('log.error writes error symbol', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prompt.log.error('error message');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain(symbols.error);
    writeSpy.mockRestore();
  });

  it('log.success writes success symbol', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prompt.log.success('success message');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain(symbols.success);
    writeSpy.mockRestore();
  });
});

describe('prompt.spinner', () => {
  it('start writes message and stop writes completion', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const s = prompt.spinner();
    s.start('Installing...');
    s.stop('Installed');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Installed');
    writeSpy.mockRestore();
  });
});
