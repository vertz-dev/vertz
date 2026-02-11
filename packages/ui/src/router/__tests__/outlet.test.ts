import { describe, expect, test } from 'vitest';
import { createContext } from '../../component/context';
import { createOutlet, type OutletContext } from '../outlet';

describe('Outlet', () => {
  test('renders child component from outlet context', () => {
    const OutletCtx = createContext<OutletContext>();
    const childNode = document.createElement('span');
    childNode.textContent = 'Child Content';

    let result: Node | undefined;
    OutletCtx.Provider(
      {
        childComponent: () => childNode,
        depth: 0,
      },
      () => {
        const Outlet = createOutlet(OutletCtx);
        result = Outlet();
      },
    );

    expect(result).toBe(childNode);
  });

  test('returns empty comment node when no context', () => {
    const OutletCtx = createContext<OutletContext>();
    const Outlet = createOutlet(OutletCtx);
    const result = Outlet();

    expect(result.nodeType).toBe(Node.COMMENT_NODE);
  });

  test('returns empty comment when context has no child component', () => {
    const OutletCtx = createContext<OutletContext>();

    let result: Node | undefined;
    OutletCtx.Provider(
      {
        childComponent: undefined,
        depth: 0,
      },
      () => {
        const Outlet = createOutlet(OutletCtx);
        result = Outlet();
      },
    );

    expect(result?.nodeType).toBe(Node.COMMENT_NODE);
  });
});
