import { describe, expect, it } from '@vertz/test';
import type { CardClasses } from '../card/card-composed';
import { ComposedCard } from '../card/card-composed';
import { withStyles } from '../composed/with-styles';

const classes: CardClasses = {
  root: 'card-root',
  header: 'card-header',
  title: 'card-title',
  description: 'card-desc',
  content: 'card-content',
  footer: 'card-footer',
  action: 'card-action',
};

// Helper functions — the Vertz compiler transforms JSX inside these
function RenderCardRoot() {
  return <ComposedCard classes={classes}>hello</ComposedCard>;
}
function RenderCardRootWithClass() {
  return (
    <ComposedCard classes={classes} className="custom">
      hi
    </ComposedCard>
  );
}
function RenderCardNoClasses() {
  return <ComposedCard>content</ComposedCard>;
}
function RenderCardHeader() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Header>header</ComposedCard.Header>
    </ComposedCard>
  );
}
function RenderCardTitle() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Title>My Title</ComposedCard.Title>
    </ComposedCard>
  );
}
function RenderCardDescription() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Description>desc text</ComposedCard.Description>
    </ComposedCard>
  );
}
function RenderCardContent() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Content>body</ComposedCard.Content>
    </ComposedCard>
  );
}
function RenderCardFooter() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Footer>footer</ComposedCard.Footer>
    </ComposedCard>
  );
}
function RenderCardAction() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Action>action</ComposedCard.Action>
    </ComposedCard>
  );
}
function RenderHeaderWithClass() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Header className="extra">h</ComposedCard.Header>
    </ComposedCard>
  );
}
function RenderTitleWithClass() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Title className="extra">t</ComposedCard.Title>
    </ComposedCard>
  );
}
function RenderFullCard() {
  return (
    <ComposedCard classes={classes}>
      <ComposedCard.Header>
        <ComposedCard.Title>Title</ComposedCard.Title>
        <ComposedCard.Description>Desc</ComposedCard.Description>
      </ComposedCard.Header>
      <ComposedCard.Content>Body</ComposedCard.Content>
      <ComposedCard.Footer>
        <ComposedCard.Action>Act</ComposedCard.Action>
      </ComposedCard.Footer>
    </ComposedCard>
  );
}
function RenderUnstyled() {
  return (
    <ComposedCard>
      <ComposedCard.Header>h</ComposedCard.Header>
    </ComposedCard>
  );
}

describe('ComposedCard', () => {
  describe('Root', () => {
    it('renders a div', () => {
      const el = RenderCardRoot();
      expect(el.tagName).toBe('DIV');
    });

    it('applies root class from classes prop', () => {
      const el = RenderCardRoot();
      const inner = el.querySelector('.card-root') ?? el;
      expect(inner.className).toContain('card-root');
    });

    it('appends user className to root class', () => {
      const el = RenderCardRootWithClass();
      const inner = el.querySelector('.card-root') ?? el;
      expect(inner.className).toContain('card-root');
      expect(inner.className).toContain('custom');
    });

    it('resolves children', () => {
      const el = RenderCardNoClasses();
      expect(el.textContent).toContain('content');
    });
  });

  describe('Sub-components receive classes from context', () => {
    it('Header gets header class', () => {
      const el = RenderCardHeader();
      const header = el.querySelector('.card-header');
      expect(header).not.toBeNull();
      expect(header?.textContent).toBe('header');
    });

    it('Title renders as h3 with title class', () => {
      const el = RenderCardTitle();
      const title = el.querySelector('h3');
      expect(title).not.toBeNull();
      expect(title?.className).toContain('card-title');
      expect(title?.textContent).toBe('My Title');
    });

    it('Description renders as p with description class', () => {
      const el = RenderCardDescription();
      const desc = el.querySelector('p');
      expect(desc).not.toBeNull();
      expect(desc?.className).toContain('card-desc');
      expect(desc?.textContent).toBe('desc text');
    });

    it('Content gets content class', () => {
      const el = RenderCardContent();
      const content = el.querySelector('.card-content');
      expect(content).not.toBeNull();
      expect(content?.textContent).toBe('body');
    });

    it('Footer gets footer class', () => {
      const el = RenderCardFooter();
      const footer = el.querySelector('.card-footer');
      expect(footer).not.toBeNull();
      expect(footer?.textContent).toBe('footer');
    });

    it('Action gets action class', () => {
      const el = RenderCardAction();
      const action = el.querySelector('.card-action');
      expect(action).not.toBeNull();
      expect(action?.textContent).toBe('action');
    });
  });

  describe('Sub-components append user classes', () => {
    it('Header appends user className', () => {
      const el = RenderHeaderWithClass();
      const header = el.querySelector('.card-header');
      expect(header?.className).toContain('extra');
    });

    it('Title appends user className', () => {
      const el = RenderTitleWithClass();
      const title = el.querySelector('h3');
      expect(title?.className).toContain('card-title');
      expect(title?.className).toContain('extra');
    });
  });

  describe('withStyles integration', () => {
    it('styled card preserves sub-components', () => {
      const StyledCard = withStyles(ComposedCard, classes);
      expect(StyledCard.Header).toBeDefined();
      expect(StyledCard.Title).toBeDefined();
      expect(StyledCard.Description).toBeDefined();
      expect(StyledCard.Content).toBeDefined();
      expect(StyledCard.Footer).toBeDefined();
      expect(StyledCard.Action).toBeDefined();
    });
  });

  describe('Full card structure', () => {
    it('renders complete card with all sub-components', () => {
      const el = RenderFullCard();
      // Root class is on el itself (querySelector doesn't match the element)
      expect(el.className).toContain('card-root');
      expect(el.querySelector('.card-header')).not.toBeNull();
      expect(el.querySelector('h3')).not.toBeNull();
      expect(el.querySelector('p')).not.toBeNull();
      expect(el.querySelector('.card-content')).not.toBeNull();
      expect(el.querySelector('.card-footer')).not.toBeNull();
      expect(el.querySelector('.card-action')).not.toBeNull();
    });
  });

  describe('Without classes (unstyled)', () => {
    it('renders without crashing when no classes provided', () => {
      const el = RenderUnstyled();
      expect(el.tagName).toBe('DIV');
    });
  });
});
