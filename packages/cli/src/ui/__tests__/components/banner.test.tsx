import { describe, expect, it } from 'vitest';
import { Banner } from '../../components/Banner';

describe('Banner', () => {
  it('renders vertz text', () => {
    const el = Banner({ version: "1.0.0" }) as any;
    // el is a React Element representing <Text>...
    const children = el.props.children;
    // children: [<Text>vertz</Text>, ' ', <Text>v1.0.0</Text>]
    expect(children[0].props.children).toBe('vertz');
  });

  it('renders version number', () => {
    const el = Banner({ version: "1.0.0" }) as any;
    const children = el.props.children;
    expect(children[2].props.children.join('')).toBe('v1.0.0');
  });
});
