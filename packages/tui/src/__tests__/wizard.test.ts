import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { symbols } from '../theme';
import type { WizardStep } from '../wizard';
import { wizard } from '../wizard';

describe('wizard', () => {
  let originalCI: string | undefined;

  beforeEach(() => {
    originalCI = process.env.CI;
    process.env.CI = 'true';
  });

  afterEach(() => {
    if (originalCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCI;
    }
  });

  it('collects results from multiple steps', async () => {
    const steps = [
      {
        id: 'name',
        prompt: async () => 'Alice',
      },
      {
        id: 'age',
        prompt: async () => 30,
      },
    ] as const satisfies readonly WizardStep[];

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const result = await wizard({ steps });

    writeSpy.mockRestore();

    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('steps receive context with previous answers', async () => {
    const receivedContexts: Record<string, unknown>[] = [];

    const steps = [
      {
        id: 'first',
        prompt: async (ctx) => {
          receivedContexts.push({ ...ctx.answers });
          return 'hello';
        },
      },
      {
        id: 'second',
        prompt: async (ctx) => {
          receivedContexts.push({ ...ctx.answers });
          return 'world';
        },
      },
    ] as const satisfies readonly WizardStep[];

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await wizard({ steps });

    writeSpy.mockRestore();

    expect(receivedContexts[0]).toEqual({});
    expect(receivedContexts[1]).toEqual({ first: 'hello' });
  });

  it('displays step indicator by default', async () => {
    const steps = [
      {
        id: 'name',
        prompt: async () => 'Alice',
      },
      {
        id: 'email',
        prompt: async () => 'alice@example.com',
      },
    ] as const satisfies readonly WizardStep[];

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await wizard({ steps });

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');

    writeSpy.mockRestore();

    expect(output).toContain(`Step 1/2 ${symbols.dash} name`);
    expect(output).toContain(`Step 2/2 ${symbols.dash} email`);
  });

  it('calls custom onStep callback instead of default indicator', async () => {
    const onStep = vi.fn();

    const steps = [
      {
        id: 'name',
        prompt: async () => 'Alice',
      },
      {
        id: 'email',
        prompt: async () => 'alice@example.com',
      },
    ] as const satisfies readonly WizardStep[];

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await wizard({ steps, onStep });

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');

    writeSpy.mockRestore();

    // Custom onStep should be called
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenCalledWith({ current: 1, total: 2, id: 'name' });
    expect(onStep).toHaveBeenCalledWith({ current: 2, total: 2, id: 'email' });

    // Default step indicator should NOT be shown
    expect(output).not.toContain('Step 1/2');
  });

  it('single step wizard works', async () => {
    const steps = [
      {
        id: 'only',
        prompt: async () => 42,
      },
    ] as const satisfies readonly WizardStep[];

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const result = await wizard({ steps });

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');

    writeSpy.mockRestore();

    expect(result.only).toBe(42);
    expect(output).toContain('Step 1/1');
  });

  it('empty steps returns empty object', async () => {
    const steps = [] as const satisfies readonly WizardStep[];

    const result = await wizard({ steps });

    expect(result).toEqual({});
  });
});
