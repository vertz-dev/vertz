import { describe, expect, it } from 'bun:test';
import { generateClassName } from '../class-generator';

describe('generateClassName', () => {
  it('produces a class name starting with underscore', () => {
    const result = generateClassName('src/components/Card.tsx', 'card');
    expect(result).toMatch(/^_[0-9a-f]{8}$/);
  });

  it('is deterministic — same input produces same output', () => {
    const a = generateClassName('src/components/Card.tsx', 'card');
    const b = generateClassName('src/components/Card.tsx', 'card');
    expect(a).toBe(b);
  });

  it('produces different names for different block names', () => {
    const card = generateClassName('src/components/Card.tsx', 'card');
    const title = generateClassName('src/components/Card.tsx', 'title');
    expect(card).not.toBe(title);
  });

  it('produces different names for different file paths', () => {
    const a = generateClassName('src/components/Card.tsx', 'card');
    const b = generateClassName('src/components/Button.tsx', 'card');
    expect(a).not.toBe(b);
  });

  it('produces 8-character hex hash', () => {
    const result = generateClassName('test.tsx', 'root');
    // Format: _<8 hex chars>
    expect(result.length).toBe(9); // underscore + 8 hex
    expect(result.substring(1)).toMatch(/^[0-9a-f]{8}$/);
  });
});
