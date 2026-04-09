import { describe, expect, it } from '@vertz/test';
import { LLMS_TXT } from '../llms-txt';

describe('LLMS_TXT', () => {
  it('starts with the Vertz title', () => {
    expect(LLMS_TXT).toMatch(/^# Vertz/);
  });

  it('includes links to documentation', () => {
    expect(LLMS_TXT).toContain('https://docs.vertz.dev/quickstart');
    expect(LLMS_TXT).toContain('https://docs.vertz.dev/installation');
    expect(LLMS_TXT).toContain('https://docs.vertz.dev/guides/llm-quick-reference');
    expect(LLMS_TXT).toContain('https://docs.vertz.dev/llms-full.txt');
  });

  it('includes the scaffold command', () => {
    expect(LLMS_TXT).toContain('bunx @vertz/create-vertz-app@latest');
  });

  it('includes both template options', () => {
    expect(LLMS_TXT).toContain('--template todo-app');
    expect(LLMS_TXT).toContain('--template hello-world');
  });

  it('includes key concepts', () => {
    expect(LLMS_TXT).toContain('d.table()');
    expect(LLMS_TXT).toContain('entity()');
    expect(LLMS_TXT).toContain('vertz/ui');
  });

  it('includes source links', () => {
    expect(LLMS_TXT).toContain('https://github.com/vertz-dev/vertz');
  });
});
