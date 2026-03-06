import { describe, expect, it } from 'bun:test';
import { generateIconSource } from '../generate';

describe('generateIconSource', () => {
  const source = generateIconSource();

  it('starts with auto-generated header', () => {
    expect(source.startsWith('// AUTO-GENERATED')).toBe(true);
  });

  it('generates Icon-suffixed functions for lucide-static string exports', () => {
    expect(source).toContain('export function MoonIcon(');
    expect(source).toContain('export function SunIcon(');
    expect(source).toContain('export function ArrowLeftIcon(');
  });

  it('generates correct type signature', () => {
    expect(source).toContain('(props?: IconProps): HTMLSpanElement {');
  });

  it('has no runtime import from lucide-static', () => {
    expect(source).not.toContain("from 'lucide-static'");
    expect(source).not.toContain('from "lucide-static"');
  });

  it('generated icon function is callable and returns HTMLSpanElement with SVG', () => {
    // Import a generated icon to verify it works at runtime
    const { MoonIcon } = require('../../src/generated-icons');
    const el = MoonIcon();
    expect(el).toBeInstanceOf(HTMLSpanElement);
    expect(el.querySelector('svg')).toBeTruthy();
  });
});
