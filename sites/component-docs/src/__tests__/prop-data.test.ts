import { describe, expect, it } from 'bun:test';
import { badgeProps } from '../props/badge-props';
import { breadcrumbProps } from '../props/breadcrumb-props';
import { buttonProps } from '../props/button-props';
import { inputProps } from '../props/input-props';
import { labelProps } from '../props/label-props';
import { paginationProps } from '../props/pagination-props';
import { separatorProps } from '../props/separator-props';
import { textareaProps } from '../props/textarea-props';
import type { PropDefinition } from '../types';

function validateProps(name: string, props: PropDefinition[]) {
  describe(name, () => {
    it('has at least one prop', () => {
      expect(props.length).toBeGreaterThanOrEqual(1);
    });

    it('has unique prop names', () => {
      const names = props.map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('all props have non-empty fields', () => {
      for (const prop of props) {
        expect(prop.name.length).toBeGreaterThan(0);
        expect(prop.type.length).toBeGreaterThan(0);
        expect(prop.default.length).toBeGreaterThan(0);
        expect(prop.description.length).toBeGreaterThan(0);
      }
    });
  });
}

describe('Prop data files', () => {
  validateProps('buttonProps', buttonProps);
  validateProps('badgeProps', badgeProps);
  validateProps('inputProps', inputProps);
  validateProps('labelProps', labelProps);
  validateProps('textareaProps', textareaProps);
  validateProps('separatorProps', separatorProps);
  validateProps('breadcrumbProps', breadcrumbProps);
  validateProps('paginationProps', paginationProps);
});

describe('Button prop specifics', () => {
  it('includes intent with primary default', () => {
    const intent = buttonProps.find((p) => p.name === 'intent');
    expect(intent).toBeDefined();
    expect(intent?.default).toBe('"primary"');
  });

  it('includes size with md default', () => {
    const size = buttonProps.find((p) => p.name === 'size');
    expect(size).toBeDefined();
    expect(size?.default).toBe('"md"');
  });

  it('includes onClick handler', () => {
    const onClick = buttonProps.find((p) => p.name === 'onClick');
    expect(onClick).toBeDefined();
    expect(onClick?.type).toContain('MouseEvent');
  });
});
