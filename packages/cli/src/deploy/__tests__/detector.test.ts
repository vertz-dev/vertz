import { describe, expect, it, vi } from 'vitest';
import { detectTarget } from '../detector';

describe('detectTarget', () => {
  it('returns fly when fly.toml exists', () => {
    const exists = vi.fn((path: string) => path.endsWith('fly.toml'));
    expect(detectTarget('/project', exists)).toBe('fly');
  });

  it('returns railway when railway.toml exists', () => {
    const exists = vi.fn((path: string) => path.endsWith('railway.toml'));
    expect(detectTarget('/project', exists)).toBe('railway');
  });

  it('returns docker when Dockerfile exists', () => {
    const exists = vi.fn((path: string) => path.endsWith('Dockerfile'));
    expect(detectTarget('/project', exists)).toBe('docker');
  });

  it('returns null when no deployment config is detected', () => {
    const exists = vi.fn(() => false);
    expect(detectTarget('/project', exists)).toBeNull();
  });

  it('checks fly.toml before railway.toml', () => {
    const exists = vi.fn(() => true);
    expect(detectTarget('/project', exists)).toBe('fly');
  });
});
