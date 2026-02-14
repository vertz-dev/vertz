/**
 * Integration test that validates every CSS shorthand token used in the
 * task-manager demo app resolves without errors.
 *
 * This exists because the token resolver has a hardcoded set of known
 * properties and color namespaces. If the demo uses a shorthand that
 * isn't supported, it throws at runtime — which is a terrible DX.
 * This test catches those gaps at build time.
 */
import { describe, it } from 'vitest';
import { parseShorthand } from '../shorthand-parser';
import { resolveToken } from '../token-resolver';

/**
 * Every unique CSS shorthand used in examples/task-manager/src/.
 * When adding new shorthands to demo code, add them here too.
 */
const DEMO_SHORTHANDS = [
  // Layout
  'flex',
  'grid',
  'flex-1',
  'flex-col',
  'inline-flex',
  'grid-cols:2',

  // Spacing
  'p:4',
  'p:6',
  'p:3',
  'px:2',
  'px:3',
  'px:4',
  'px:6',
  'py:1',
  'py:2',
  'py:3',
  'py:0.5',
  'py:12',
  'pt:3',
  'mt:1',
  'mt:2',
  'mt:3',
  'mb:1',
  'mb:2',
  'mb:3',
  'mb:4',
  'mb:6',
  'mb:8',
  'mx:auto',
  'gap:1',
  'gap:2',
  'gap:4',

  // Sizing
  'w:full',
  'w:64',
  'h:8',
  'h:10',
  'h:12',
  'min-h:screen',
  'min-h:24',
  'max-w:lg',
  'max-w:md',
  'max-w:2xl',

  // Colors
  'bg:background',
  'bg:surface',
  'bg:primary.600',
  'bg:primary.100',
  'bg:success.100',
  'bg:warning.100',
  'bg:danger.100',
  'bg:danger.500',
  'bg:gray.100',
  'bg:gray.900',
  'text:foreground',
  'text:muted',
  'text:white',
  'text:primary.700',
  'text:success.500',
  'text:success.700',
  'text:warning.700',
  'text:danger.500',
  'text:danger.700',
  'text:gray.600',
  'border:border',
  'border:primary.500',

  // Border width
  'border:1',
  'border:2',
  'border-r:1',
  'border-t:1',

  // Border radius
  'rounded:md',
  'rounded:lg',
  'rounded:full',

  // Shadow
  'shadow:xl',

  // Typography
  'font:medium',
  'font:semibold',
  'font:bold',
  'font:lg',
  'font:sm',
  'font:xs',
  'font:base',
  'font:2xl',
  'font:4xl',
  'text:sm',
  'text:xs',
  'text:center',
  'leading:relaxed',
  'tracking:wide',
  'uppercase',

  // Alignment
  'items:center',
  'items:start',
  'justify:center',
  'justify:between',
  'justify:end',

  // Interactive
  'cursor:pointer',
  'transition:colors',
  'transition:shadow',
  'transition:all',
  'resize:vertical',
  'outline-none',
  'opacity:50',

  // Position & z-index
  'fixed',
  'inset:0',
  'z:40',
  'z:50',

  // Pseudo states
  'hover:bg:primary.700',
  'hover:bg:gray.100',
  'hover:bg:surface',
  'hover:bg:danger.700',
  'hover:text:foreground',
  'hover:shadow:md',
  'focus:outline-none',
  'focus:ring:2',
  'focus:ring:primary.500',
  'focus:border:primary.500',
];

describe('demo app shorthand coverage', () => {
  const failures: string[] = [];

  for (const shorthand of DEMO_SHORTHANDS) {
    it(`resolves '${shorthand}' without error`, () => {
      try {
        const parsed = parseShorthand(shorthand);
        resolveToken(parsed);
      } catch (e) {
        failures.push(`${shorthand}: ${(e as Error).message}`);
        throw e;
      }
    });
  }
});
