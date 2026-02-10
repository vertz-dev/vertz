import { describe, expect, it, vi } from 'vitest';
import type { PromptAdapter } from '../resolver';
import { CliRuntimeError, resolveParameters } from '../resolver';
import type { CommandDefinition, ParameterResolver } from '../types';

function createMockContext() {
  return {
    client: {} as never,
    args: {},
  };
}

function createMockPromptAdapter(overrides: Partial<PromptAdapter> = {}): PromptAdapter {
  return {
    select: overrides.select ?? vi.fn().mockResolvedValue('selected'),
    text: overrides.text ?? vi.fn().mockResolvedValue('entered'),
  };
}

describe('resolveParameters', () => {
  it('passes through provided flags as-is', async () => {
    const definition: CommandDefinition = {
      method: 'GET',
      path: '/users',
      description: 'List users',
      query: {
        page: { type: 'number', required: false },
      },
    };

    const result = await resolveParameters(definition, { page: '2' }, {}, createMockContext());

    expect(result.page).toBe(2);
  });

  it('coerces string to number for number fields', async () => {
    const definition: CommandDefinition = {
      method: 'GET',
      path: '/users',
      description: 'List users',
      query: {
        limit: { type: 'number', required: false },
      },
    };

    const result = await resolveParameters(definition, { limit: '10' }, {}, createMockContext());

    expect(result.limit).toBe(10);
  });

  it('coerces string to boolean for boolean fields', async () => {
    const definition: CommandDefinition = {
      method: 'GET',
      path: '/users',
      description: 'List users',
      query: {
        verbose: { type: 'boolean', required: false },
      },
    };

    const result = await resolveParameters(
      definition,
      { verbose: 'true' },
      {},
      createMockContext(),
    );

    expect(result.verbose).toBe(true);
  });

  it('uses resolver when parameter is missing and required', async () => {
    const definition: CommandDefinition = {
      method: 'GET',
      path: '/users/:id',
      description: 'Get user',
      params: {
        id: { type: 'string', description: 'User ID', required: true },
      },
    };

    const resolver: ParameterResolver = {
      param: 'id',
      fetchOptions: vi.fn().mockResolvedValue([
        { label: 'Alice', value: 'user-1' },
        { label: 'Bob', value: 'user-2' },
      ]),
      prompt: 'Select a user',
    };

    const promptAdapter = createMockPromptAdapter({
      select: vi.fn().mockResolvedValue('user-1'),
    });

    const result = await resolveParameters(
      definition,
      {},
      { id: resolver },
      createMockContext(),
      promptAdapter,
    );

    expect(result.id).toBe('user-1');
    expect(resolver.fetchOptions).toHaveBeenCalled();
    expect(promptAdapter.select).toHaveBeenCalledWith({
      message: 'Select a user',
      choices: [
        { label: 'Alice', value: 'user-1' },
        { label: 'Bob', value: 'user-2' },
      ],
    });
  });

  it('prompts for enum fields when missing', async () => {
    const definition: CommandDefinition = {
      method: 'POST',
      path: '/users',
      description: 'Create user',
      body: {
        role: { type: 'string', required: true, enum: ['admin', 'user'] },
      },
    };

    const promptAdapter = createMockPromptAdapter({
      select: vi.fn().mockResolvedValue('admin'),
    });

    const result = await resolveParameters(definition, {}, {}, createMockContext(), promptAdapter);

    expect(result.role).toBe('admin');
    expect(promptAdapter.select).toHaveBeenCalledWith({
      message: expect.any(String),
      choices: [
        { label: 'admin', value: 'admin' },
        { label: 'user', value: 'user' },
      ],
    });
  });

  it('prompts for text input when required field has no resolver or enum', async () => {
    const definition: CommandDefinition = {
      method: 'POST',
      path: '/users',
      description: 'Create user',
      body: {
        name: { type: 'string', description: 'User name', required: true },
      },
    };

    const promptAdapter = createMockPromptAdapter({
      text: vi.fn().mockResolvedValue('Alice'),
    });

    const result = await resolveParameters(definition, {}, {}, createMockContext(), promptAdapter);

    expect(result.name).toBe('Alice');
    expect(promptAdapter.text).toHaveBeenCalledWith({
      message: 'User name',
    });
  });

  it('skips optional parameters that are not provided', async () => {
    const definition: CommandDefinition = {
      method: 'GET',
      path: '/users',
      description: 'List users',
      query: {
        page: { type: 'number', required: false },
        search: { type: 'string', required: false },
      },
    };

    const promptAdapter = createMockPromptAdapter();

    const result = await resolveParameters(definition, {}, {}, createMockContext(), promptAdapter);

    expect(result.page).toBeUndefined();
    expect(result.search).toBeUndefined();
    expect(promptAdapter.text).not.toHaveBeenCalled();
    expect(promptAdapter.select).not.toHaveBeenCalled();
  });

  it('does not prompt when required parameter is already provided', async () => {
    const definition: CommandDefinition = {
      method: 'GET',
      path: '/users/:id',
      description: 'Get user',
      params: {
        id: { type: 'string', required: true },
      },
    };

    const promptAdapter = createMockPromptAdapter();

    const result = await resolveParameters(
      definition,
      { id: 'user-123' },
      {},
      createMockContext(),
      promptAdapter,
    );

    expect(result.id).toBe('user-123');
    expect(promptAdapter.text).not.toHaveBeenCalled();
    expect(promptAdapter.select).not.toHaveBeenCalled();
  });

  it('throws CliRuntimeError when default adapter has no choices', async () => {
    const definition: CommandDefinition = {
      method: 'GET',
      path: '/users/:id',
      description: 'Get user',
      params: {
        id: { type: 'string', description: 'User ID', required: true },
      },
    };

    // Use default prompt adapter (no interactive input)
    await expect(resolveParameters(definition, {}, {}, createMockContext())).rejects.toThrow(
      CliRuntimeError,
    );
  });
});
