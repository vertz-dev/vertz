import { describe, expect, it } from 'bun:test';
import type { ComponentRegistry } from '../component-registry';
import { resolveComponent } from '../component-registry';

describe('resolveComponent', () => {
  it('resolves a component from the registry', async () => {
    const mockComponent = (_props: Record<string, unknown>, _el: Element): void => {};
    const registry: ComponentRegistry = {
      Counter: () => Promise.resolve({ default: mockComponent }),
    };

    const resolved = await resolveComponent(registry, 'Counter');
    expect(resolved).toBe(mockComponent);
  });

  it('throws for unregistered component', async () => {
    const registry: ComponentRegistry = {};

    await expect(resolveComponent(registry, 'Missing')).rejects.toThrow(
      'Component "Missing" not found in registry',
    );
  });
});
