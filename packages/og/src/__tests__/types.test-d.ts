import { describe, it } from '@vertz/test';
import type { SatoriChild, SatoriElement } from '../types';

describe('SatoriElement type', () => {
  it('accepts a valid element with style and string children', () => {
    const _el: SatoriElement = {
      type: 'div',
      props: {
        style: { display: 'flex', fontSize: 72 },
        children: 'Hello world',
      },
    };
  });

  it('accepts nested element children', () => {
    const _el: SatoriElement = {
      type: 'div',
      props: {
        children: [
          { type: 'h1', props: { children: 'Title' } },
          { type: 'p', props: { children: 'Body text' } },
        ],
      },
    };
  });

  it('accepts img elements with src, width, height', () => {
    const _el: SatoriElement = {
      type: 'img',
      props: { src: 'data:image/png;base64,abc', width: 200, height: 100 },
    };
  });

  it('rejects elements missing type', () => {
    // @ts-expect-error -- SatoriElement requires a `type` property
    const _el: SatoriElement = { props: { children: 'hello' } };
  });

  it('rejects elements missing props', () => {
    // @ts-expect-error -- SatoriElement requires a `props` property
    const _el: SatoriElement = { type: 'div' };
  });
});

describe('SatoriChild type', () => {
  it('accepts string, number, boolean, null, undefined', () => {
    const _children: SatoriChild[] = ['text', 42, true, null, undefined];
  });

  it('accepts SatoriElement', () => {
    const _child: SatoriChild = { type: 'span', props: { children: 'hi' } };
  });
});
