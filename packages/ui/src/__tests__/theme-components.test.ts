import { afterEach, describe, expect, it } from '@vertz/test';
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

  describe('primitive suite proxies', () => {
    it('Dialog proxy is non-callable and has sub-component getters', async () => {
      const mockTitle = () => ({ type: 'title' });
      const mockClose = () => ({ type: 'close' });
      const mockCancel = () => ({ type: 'cancel' });
      const mockDialog = {
        Title: mockTitle,
        Close: mockClose,
        Cancel: mockCancel,
      };
      registerTheme({ components: { primitives: { Dialog: mockDialog } } });

      const { Dialog } = await import('../components/index');
      const dialog = Dialog as {
        Title: () => { type: string };
        Close: () => { type: string };
        Cancel: () => { type: string };
      };

      // Not callable — stack handles opening
      expect(typeof Dialog).not.toBe('function');

      // Sub-components are accessible
      expect(dialog.Title).toBe(mockTitle);
      expect(dialog.Close).toBe(mockClose);
      expect(dialog.Cancel).toBe(mockCancel);
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
