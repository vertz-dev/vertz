/**
 * SSR rendering for the List primitive.
 *
 * Exercises the SSR pipeline that `vertz build` uses for pre-rendering, so
 * Provider-based context propagation between `<List>` and `<List.Item>` is
 * covered end-to-end on the server side (#2878).
 */

import { describe, expect, it } from '@vertz/test';
import { installDomShim } from '@vertz/ui-server/dom-shim';
import { ssrRenderSinglePass } from '@vertz/ui-server';
import { ComposedList as List } from '../list-composed';

installDomShim();

describe('Feature: List primitive SSR rendering', () => {
  describe('Given <List><List.Item /></List> in a page component', () => {
    describe('When pre-rendering via the SSR pipeline', () => {
      it('then the route pre-renders and emits both the <ul> and <li> children', async () => {
        const module = {
          default: () => (
            <List>
              <List.Item>first</List.Item>
              <List.Item>second</List.Item>
            </List>
          ),
        };

        const result = await ssrRenderSinglePass(module, '/');

        expect(result.html).toContain('<ul');
        expect(result.html).toContain('<li');
        expect(result.html).toContain('first');
        expect(result.html).toContain('second');
      });

      it('then items produced by .map() render through the List context', async () => {
        const items = [
          { id: 1, text: 'one' },
          { id: 2, text: 'two' },
        ];
        const module = {
          default: () => (
            <List animate={{ duration: 200, easing: 'ease-out' }}>
              {items.map((item) => (
                <List.Item key={item.id}>{item.text}</List.Item>
              ))}
            </List>
          ),
        };

        const result = await ssrRenderSinglePass(module, '/');

        expect(result.html).toContain('<ul');
        expect(result.html).toContain('one');
        expect(result.html).toContain('two');
      });
    });
  });

  describe('Given <List.Item /> rendered WITHOUT a parent <List>', () => {
    describe('When pre-rendering', () => {
      it('then it still throws the descriptive error (no regression)', async () => {
        const module = {
          default: () => <List.Item>orphan</List.Item>,
        };

        await expect(ssrRenderSinglePass(module, '/')).rejects.toThrow(
          /List\.Item must be used inside a <List>/,
        );
      });
    });
  });
});
