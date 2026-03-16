import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedTooltip } from '../tooltip-composed';

describe('Composed Tooltip', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Tooltip with Trigger and Content sub-components', () => {
    describe('When rendered', () => {
      it('Then creates a wrapper with trigger and tooltip content', () => {
        const btn = document.createElement('button');
        btn.textContent = 'Hover me';

        const root = ComposedTooltip({
          children: () => {
            const t = ComposedTooltip.Trigger({ children: [btn] });
            const c = ComposedTooltip.Content({ children: ['Tooltip text'] });
            return [t, c];
          },
        });
        container.appendChild(root);

        expect(root.contains(btn)).toBe(true);
        const tooltip = root.querySelector('[role="tooltip"]');
        expect(tooltip).not.toBeNull();
      });
    });
  });

  describe('Given a Tooltip with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies content class to the tooltip element', () => {
        const btn = document.createElement('button');

        const root = ComposedTooltip({
          classes: { content: 'styled-tooltip' },
          children: () => {
            const t = ComposedTooltip.Trigger({ children: [btn] });
            const c = ComposedTooltip.Content({ children: ['Tip'] });
            return [t, c];
          },
        });
        container.appendChild(root);

        const tooltip = root.querySelector('[role="tooltip"]') as HTMLElement;
        expect(tooltip!.className).toContain('styled-tooltip');
      });
    });
  });

  describe('Given a Tooltip trigger element', () => {
    it('Then sets aria-describedby linking to tooltip content', () => {
      const btn = document.createElement('button');

      const root = ComposedTooltip({
        children: () => {
          const t = ComposedTooltip.Trigger({ children: [btn] });
          const c = ComposedTooltip.Content({ children: ['Tip'] });
          return [t, c];
        },
      });
      container.appendChild(root);

      const tooltip = root.querySelector('[role="tooltip"]') as HTMLElement;
      // The trigger wrapper should have aria-describedby pointing to the tooltip
      const triggerWrapper = root.querySelector('[aria-describedby]') as HTMLElement;
      expect(triggerWrapper).not.toBeNull();
      expect(triggerWrapper!.getAttribute('aria-describedby')).toBe(tooltip!.id);
    });
  });

  describe('Given a Tooltip content with children', () => {
    it('Then moves children into the tooltip element', () => {
      const root = ComposedTooltip({
        children: () => {
          const t = ComposedTooltip.Trigger({ children: ['Hover'] });
          const c = ComposedTooltip.Content({ children: ['Help text'] });
          return [t, c];
        },
      });
      container.appendChild(root);

      const tooltip = root.querySelector('[role="tooltip"]') as HTMLElement;
      expect(tooltip!.textContent).toBe('Help text');
    });
  });

  describe('Given a Tooltip.Trigger rendered outside Tooltip', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedTooltip.Trigger({ children: ['Orphan'] });
        }).toThrow('<Tooltip.Trigger> must be used inside <Tooltip>');
      });
    });
  });

  describe('Given a Tooltip.Content rendered outside Tooltip', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedTooltip.Content({ children: ['Orphan'] });
        }).toThrow('<Tooltip.Content> must be used inside <Tooltip>');
      });
    });
  });
});
