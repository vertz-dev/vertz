import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Banner } from '../../components/Banner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getProps = (el: any) => el.props;

describe('Banner', () => {
  it('renders vertz text', () => {
    const el = Banner({ version: "1.0.0" }) as ReactElement;
    // el is a React Element representing <Text>...
    const children = getProps(el).children;
    // children: [<Text>vertz</Text>, ' ', <Text>v1.0.0</Text>]
    expect(children[0].props.children).toBe('vertz');
  });

  it('renders version number', () => {
    const el = Banner({ version: "1.0.0" }) as ReactElement;
    const children = getProps(el).children;
    expect(children[2].props.children.join('')).toBe('v1.0.0');
  });
});
