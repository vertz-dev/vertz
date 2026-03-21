import { afterEach, describe, expect, it } from 'bun:test';
import { _resetTheme, registerTheme } from '../theme/registry';

describe('@vertz/ui/components proxies', () => {
  afterEach(() => _resetTheme());

  describe('direct component proxies', () => {
    it('Button proxy delegates to registered theme component', async () => {
      const mockButton = (props: Record<string, unknown>) => ({
        type: 'button',
        props,
      });
      registerTheme({ components: { Button: mockButton } });

      const { Button } = await import('../components/index');
      const result = (Button as (props: Record<string, unknown>) => { type: string })({
        intent: 'primary',
      });
      expect(result.type).toBe('button');
    });

    it('throws when calling a proxy without registering a theme', async () => {
      const { Button } = await import('../components/index');
      expect(() => (Button as (props: Record<string, unknown>) => unknown)({})).toThrow(
        'No theme registered',
      );
    });
  });

  describe('compound primitive proxies', () => {
    it('Dialog proxy is callable and has sub-component getters', async () => {
      const mockTrigger = () => ({ type: 'trigger' });
      const mockContent = () => ({ type: 'content' });
      const mockDialog = Object.assign(() => ({ type: 'dialog-root' }), {
        Trigger: mockTrigger,
        Content: mockContent,
      });
      registerTheme({ components: { primitives: { Dialog: mockDialog } } });

      const { Dialog } = await import('../components/index');
      const dialog = Dialog as {
        (props: unknown): { type: string };
        Trigger: () => { type: string };
        Content: () => { type: string };
      };

      // Root is callable
      const root = dialog({});
      expect(root.type).toBe('dialog-root');

      // Sub-components are accessible
      expect(dialog.Trigger).toBe(mockTrigger);
      expect(dialog.Content).toBe(mockContent);
    });
  });

  describe('suite component proxies', () => {
    it('Card proxy is callable and exposes sub-components via short names', async () => {
      const mockCard = () => ({ type: 'card' });
      const mockHeader = () => ({ type: 'card-header' });
      const cardSuite = Object.assign(mockCard, { Header: mockHeader });
      registerTheme({ components: { Card: cardSuite } });

      const { Card } = await import('../components/index');
      expect(typeof Card).toBe('function');
      const result = (Card as (...args: unknown[]) => { type: string })({});
      expect(result.type).toBe('card');

      const card = Card as unknown as { Header: () => { type: string } };
      expect(card.Header).toBe(mockHeader);
    });
  });

  describe('simple primitive proxies', () => {
    it('Checkbox proxy delegates to registered primitive', async () => {
      const mockCheckbox = (props: Record<string, unknown>) => ({
        type: 'checkbox',
        props,
      });
      registerTheme({ components: { primitives: { Checkbox: mockCheckbox } } });

      const { Checkbox } = await import('../components/index');
      const result = (Checkbox as (props: Record<string, unknown>) => { type: string })({
        checked: true,
      });
      expect(result.type).toBe('checkbox');
    });
  });
});
