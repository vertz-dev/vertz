import { describe, expect, it } from 'bun:test';
import { ComposedSkeleton } from '../skeleton-composed';

describe('Composed Skeleton', () => {
  describe('Given a ComposedSkeleton', () => {
    describe('When rendered', () => {
      it('Then returns a div element', () => {
        const el = ComposedSkeleton({});
        expect(el.tagName).toBe('DIV');
      });

      it('Then sets aria-hidden="true"', () => {
        const el = ComposedSkeleton({});
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });

      it('Then applies classes.root as className', () => {
        const el = ComposedSkeleton({ classes: { root: 'skeleton-pulse' } });
        expect(el.className).toBe('skeleton-pulse');
      });
    });
  });

  describe('Given a ComposedSkeleton with dimensions', () => {
    describe('When rendered with width and height', () => {
      it('Then sets width via inline style', () => {
        const el = ComposedSkeleton({ width: '200px' });
        expect(el.style.width).toBe('200px');
      });

      it('Then sets height via inline style', () => {
        const el = ComposedSkeleton({ height: '40px' });
        expect(el.style.height).toBe('40px');
      });
    });

    describe('When rendered without dimensions', () => {
      it('Then does not set width or height styles', () => {
        const el = ComposedSkeleton({});
        expect(el.style.width).toBe('');
        expect(el.style.height).toBe('');
      });
    });
  });

  describe('Given a ComposedSkeleton called with no args', () => {
    describe('When rendered', () => {
      it('Then works with default empty props', () => {
        const el = ComposedSkeleton();
        expect(el.tagName).toBe('DIV');
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });
});

describe('Skeleton.Text sub-component', () => {
  describe('Given Skeleton.Text with lines=3', () => {
    describe('When rendered', () => {
      it('Then renders a container div with aria-hidden="true"', () => {
        const el = ComposedSkeleton.Text({});
        expect(el.tagName).toBe('DIV');
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });

      it('Then renders 3 child divs by default', () => {
        const el = ComposedSkeleton.Text({});
        expect(el.children.length).toBe(3);
      });

      it('Then renders specified number of lines', () => {
        const el = ComposedSkeleton.Text({ lines: 5 });
        expect(el.children.length).toBe(5);
      });

      it('Then applies classes.line to each child', () => {
        const el = ComposedSkeleton.Text({ classes: { line: 'sk-line' } });
        for (let i = 0; i < el.children.length; i++) {
          expect((el.children[i] as HTMLElement).className).toBe('sk-line');
        }
      });

      it('Then applies classes.root to the container', () => {
        const el = ComposedSkeleton.Text({ classes: { root: 'sk-text' } });
        expect(el.className).toBe('sk-text');
      });

      it('Then the last line has width from lastLineWidth prop', () => {
        const el = ComposedSkeleton.Text({ lines: 3, lastLineWidth: '60%' });
        const last = el.children[2] as HTMLElement;
        expect(last.style.width).toBe('60%');
      });

      it('Then defaults lastLineWidth to "75%"', () => {
        const el = ComposedSkeleton.Text({});
        const last = el.children[2] as HTMLElement;
        expect(last.style.width).toBe('75%');
      });

      it('Then non-last lines have no width restriction', () => {
        const el = ComposedSkeleton.Text({ lines: 3 });
        const first = el.children[0] as HTMLElement;
        expect(first.style.width).toBe('');
      });

      it('Then sets height on each line from height prop', () => {
        const el = ComposedSkeleton.Text({ height: '1.5rem' });
        const first = el.children[0] as HTMLElement;
        expect(first.style.height).toBe('1.5rem');
      });

      it('Then sets gap between lines from gap prop', () => {
        const el = ComposedSkeleton.Text({ gap: '8px' });
        expect(el.style.gap).toBe('8px');
      });
    });
  });

  describe('Given Skeleton.Text with lines=0', () => {
    describe('When rendered', () => {
      it('Then renders an empty container with no children', () => {
        const el = ComposedSkeleton.Text({ lines: 0 });
        expect(el.children.length).toBe(0);
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });

  describe('Given Skeleton.Text with lines=1', () => {
    describe('When rendered', () => {
      it('Then renders a single line with lastLineWidth applied', () => {
        const el = ComposedSkeleton.Text({ lines: 1 });
        expect(el.children.length).toBe(1);
        expect((el.children[0] as HTMLElement).style.width).toBe('75%');
      });
    });
  });
});

describe('Skeleton.Circle sub-component', () => {
  describe('Given Skeleton.Circle with size="40px"', () => {
    describe('When rendered', () => {
      it('Then renders a div with aria-hidden="true"', () => {
        const el = ComposedSkeleton.Circle({ size: '40px' });
        expect(el.tagName).toBe('DIV');
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });

      it('Then sets width and height to size', () => {
        const el = ComposedSkeleton.Circle({ size: '40px' });
        expect(el.style.width).toBe('40px');
        expect(el.style.height).toBe('40px');
      });

      it('Then applies classes.root', () => {
        const el = ComposedSkeleton.Circle({ classes: { root: 'sk-circle' } });
        expect(el.className).toBe('sk-circle');
      });

      it('Then defaults size to "2.5rem"', () => {
        const el = ComposedSkeleton.Circle({});
        expect(el.style.width).toBe('2.5rem');
        expect(el.style.height).toBe('2.5rem');
      });
    });
  });
});
