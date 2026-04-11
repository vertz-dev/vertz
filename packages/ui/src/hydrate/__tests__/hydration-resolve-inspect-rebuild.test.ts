/**
 * Regression test suite for the resolve-inspect-rebuild hydration pattern.
 *
 * This pattern is used by compound components (Card, FormLayout, Tabs, etc.)
 * that resolve children thunks, inspect the resulting nodes for data extraction,
 * then build new DOM structures that claim the actual SSR elements.
 *
 * If claim functions ever become non-transactional (i.e., corrupt the cursor
 * on failure), these tests will catch it.
 *
 * Related: #1357 (cursor restoration fix), #1361 (composed primitive hydration),
 *          #1362 (this suite).
 */
import { afterEach, describe, expect, it } from '@vertz/test';
import type { ChildValue } from '../../component/children';
import { resolveChildren } from '../../component/children';
import {
  claimElement,
  claimText,
  endHydration,
  enterChildren,
  exitChildren,
  startHydration,
} from '../hydration-context';

/**
 * Helper to suppress hydration dev warnings during tests.
 * Returns a cleanup function to restore spies.
 */
function suppressHydrationWarnings() {
  const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  return () => {
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  };
}

describe('resolve-inspect-rebuild hydration pattern', () => {
  afterEach(() => {
    endHydration();
  });

  describe('basic pattern: resolve → extract data → build DOM', () => {
    it('children thunk creating elements does not corrupt cursor for return JSX', () => {
      // SSR: <div class="card"><h2>Title</h2><p>Body</p></div>
      // Pattern: children thunk creates slot marker elements (fail to claim),
      // component extracts data, return JSX claims actual structure.
      const root = document.createElement('div');
      root.innerHTML = '<div class="card"><h2>Title</h2><p>Body</p></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Step 1: children thunk runs — creates elements that try to claim
      // (simulating slot markers like <slot-header>, <slot-body>)
      const childrenThunk = () => {
        // These fail because SSR has <div>, not <slot-header>/<slot-body>
        claimElement('slot-header');
        claimElement('slot-body');
        return [];
      };
      childrenThunk();

      // Step 2: return JSX claims the actual card structure
      const card = claimElement('div');
      expect(card).not.toBeNull();
      expect(card?.className).toBe('card');

      enterChildren(card!);
      const h2 = claimElement('h2');
      expect(h2).not.toBeNull();
      expect(h2?.textContent).toBe('Title');

      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe('Body');
      exitChildren();

      restore();
    });

    it('data extracted from resolved children is available for rebuilding', () => {
      // SSR: <section><h3>Section Title</h3><article>Content</article></section>
      // Pattern: resolve children to inspect their structure,
      // then build the actual DOM from scratch using extracted data.
      const root = document.createElement('div');
      root.innerHTML = '<section><h3>Section Title</h3><article>Content</article></section>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Step 1: resolveChildren from a thunk that creates non-matching elements
      const resolved = resolveChildren(() => {
        // These create DOM nodes outside hydration's SSR tree
        const header = document.createElement('span');
        header.setAttribute('data-slot', 'header');
        header.textContent = 'Section Title';

        const body = document.createElement('span');
        body.setAttribute('data-slot', 'body');
        body.textContent = 'Content';

        return [header, body] as ChildValue;
      });

      // Step 2: extract data from resolved nodes
      const slotData = resolved.map((node) => ({
        slot: (node as HTMLElement).getAttribute('data-slot'),
        text: node.textContent,
      }));
      expect(slotData).toHaveLength(2);
      expect(slotData[0]?.slot).toBe('header');
      expect(slotData[1]?.slot).toBe('body');

      // Step 3: return JSX claims actual SSR structure
      const section = claimElement('section');
      expect(section).not.toBeNull();

      enterChildren(section!);
      const h3 = claimElement('h3');
      expect(h3).not.toBeNull();
      expect(h3?.textContent).toBe('Section Title');

      const article = claimElement('article');
      expect(article).not.toBeNull();
      expect(article?.textContent).toBe('Content');
      exitChildren();

      restore();
    });
  });

  describe('slot scanning with failed claims', () => {
    it('multiple failed element claims followed by successful claims', () => {
      // SSR: <nav><a href="/">Home</a><a href="/about">About</a></nav>
      // Slot scanner tries to find <slot-item> markers — all fail.
      // Return JSX claims the actual <nav> and <a> elements.
      const root = document.createElement('div');
      root.innerHTML = '<nav><a href="/">Home</a><a href="/about">About</a></nav>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Simulate 5 failed slot marker claims
      for (let i = 0; i < 5; i++) {
        const marker = claimElement('slot-item');
        expect(marker).toBeNull();
      }

      // Return JSX claims the real structure
      const nav = claimElement('nav');
      expect(nav).not.toBeNull();
      expect(nav?.tagName).toBe('NAV');

      enterChildren(nav!);
      const link1 = claimElement('a');
      expect(link1).not.toBeNull();
      expect(link1?.textContent).toBe('Home');

      const link2 = claimElement('a');
      expect(link2).not.toBeNull();
      expect(link2?.textContent).toBe('About');
      exitChildren();

      restore();
    });

    it('mixed failed text and element claims do not corrupt cursor', () => {
      // SSR: <div><span>Label</span><input /></div>
      // Slot scanner tries to find text (for label extraction) and elements.
      const root = document.createElement('div');
      root.innerHTML = '<div><span>Label</span><input /></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Try to claim a text node at root level — none exists (only <div>)
      const text = claimText();
      expect(text).toBeNull();

      // Try to claim a non-existent element
      const slot = claimElement('slot-label');
      expect(slot).toBeNull();

      // Actual structure claims should succeed
      const div = claimElement('div');
      expect(div).not.toBeNull();

      enterChildren(div!);
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.textContent).toBe('Label');

      const input = claimElement('input');
      expect(input).not.toBeNull();
      exitChildren();

      restore();
    });
  });

  describe('nested composed components', () => {
    it('outer component slot scan + inner component slot scan both succeed', () => {
      // SSR: <div class="card">
      //        <div class="card-header"><h2>Title</h2></div>
      //        <div class="card-body"><p>Content</p></div>
      //      </div>
      // Both Card and CardBody perform slot scanning during hydration.
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="card">' +
        '<div class="card-header"><h2>Title</h2></div>' +
        '<div class="card-body"><p>Content</p></div>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Outer Card: slot scan for header/body markers → fails
      expect(claimElement('card-slot')).toBeNull();
      expect(claimElement('card-slot')).toBeNull();

      // Outer Card: claim actual card wrapper
      const card = claimElement('div');
      expect(card).not.toBeNull();
      expect(card?.className).toBe('card');

      enterChildren(card!);

      // Inner CardHeader: slot scan → fails
      expect(claimElement('header-slot')).toBeNull();

      // Inner CardHeader: claim actual header
      const header = claimElement('div');
      expect(header).not.toBeNull();
      expect(header?.className).toBe('card-header');

      enterChildren(header!);
      const h2 = claimElement('h2');
      expect(h2).not.toBeNull();
      expect(h2?.textContent).toBe('Title');
      exitChildren();

      // Inner CardBody: slot scan → fails
      expect(claimElement('body-slot')).toBeNull();

      // Inner CardBody: claim actual body
      const body = claimElement('div');
      expect(body).not.toBeNull();
      expect(body?.className).toBe('card-body');

      enterChildren(body!);
      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe('Content');
      exitChildren();

      exitChildren(); // exit card

      restore();
    });

    it('three levels of nesting with slot scanning at each level', () => {
      // SSR: <div class="layout">
      //        <div class="sidebar"><ul><li>Item 1</li><li>Item 2</li></ul></div>
      //        <div class="content"><div class="panel"><p>Panel text</p></div></div>
      //      </div>
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="layout">' +
        '<div class="sidebar"><ul><li>Item 1</li><li>Item 2</li></ul></div>' +
        '<div class="content"><div class="panel"><p>Panel text</p></div></div>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Level 1: Layout — slot scan fails
      expect(claimElement('layout-slot')).toBeNull();

      const layout = claimElement('div');
      expect(layout).not.toBeNull();
      expect(layout?.className).toBe('layout');

      enterChildren(layout!);

      // Level 2: Sidebar — slot scan fails
      expect(claimElement('sidebar-slot')).toBeNull();

      const sidebar = claimElement('div');
      expect(sidebar).not.toBeNull();
      expect(sidebar?.className).toBe('sidebar');

      enterChildren(sidebar!);
      const ul = claimElement('ul');
      expect(ul).not.toBeNull();

      // Level 3: List items inside sidebar
      enterChildren(ul!);
      const li1 = claimElement('li');
      expect(li1).not.toBeNull();
      expect(li1?.textContent).toBe('Item 1');
      const li2 = claimElement('li');
      expect(li2).not.toBeNull();
      expect(li2?.textContent).toBe('Item 2');
      exitChildren(); // exit ul

      exitChildren(); // exit sidebar

      // Level 2: Content — slot scan fails
      expect(claimElement('content-slot')).toBeNull();

      const content = claimElement('div');
      expect(content).not.toBeNull();
      expect(content?.className).toBe('content');

      enterChildren(content!);

      // Level 3: Panel inside content — slot scan fails
      expect(claimElement('panel-slot')).toBeNull();

      const panel = claimElement('div');
      expect(panel).not.toBeNull();
      expect(panel?.className).toBe('panel');

      enterChildren(panel!);
      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe('Panel text');
      exitChildren(); // exit panel

      exitChildren(); // exit content

      exitChildren(); // exit layout

      restore();
    });
  });

  describe('mixed slot and non-slot children', () => {
    it('some children match slots, others are pass-through', () => {
      // SSR: <div class="form-layout">
      //        <label>Name</label><input /><span class="help">Required</span>
      //      </div>
      // FormLayout: resolves children, some are slotted (label, help), input passes through.
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="form-layout">' +
        '<label>Name</label>' +
        '<input />' +
        '<span class="help">Required</span>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Slot scan: look for slot markers that don't exist
      expect(claimElement('form-label')).toBeNull();
      expect(claimElement('form-control')).toBeNull();
      expect(claimElement('form-help')).toBeNull();

      // Claim actual structure
      const formLayout = claimElement('div');
      expect(formLayout).not.toBeNull();
      expect(formLayout?.className).toBe('form-layout');

      enterChildren(formLayout!);

      const label = claimElement('label');
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe('Name');

      const input = claimElement('input');
      expect(input).not.toBeNull();

      const help = claimElement('span');
      expect(help).not.toBeNull();
      expect(help?.className).toBe('help');
      expect(help?.textContent).toBe('Required');

      exitChildren();

      restore();
    });

    it('interleaved failed and successful claims within children', () => {
      // SSR: <div><h1>Title</h1><p>Paragraph 1</p><p>Paragraph 2</p></div>
      // Component tries to find optional elements between real ones.
      const root = document.createElement('div');
      root.innerHTML = '<div><h1>Title</h1><p>Paragraph 1</p><p>Paragraph 2</p></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      const div = claimElement('div');
      expect(div).not.toBeNull();

      enterChildren(div!);

      // Claim real h1
      const h1 = claimElement('h1');
      expect(h1).not.toBeNull();
      expect(h1?.textContent).toBe('Title');

      // Try to find optional subtitle — doesn't exist
      expect(claimElement('h2')).toBeNull();

      // Claim real p elements
      const p1 = claimElement('p');
      expect(p1).not.toBeNull();
      expect(p1?.textContent).toBe('Paragraph 1');

      // Try to find optional divider — doesn't exist
      expect(claimElement('hr')).toBeNull();

      const p2 = claimElement('p');
      expect(p2).not.toBeNull();
      expect(p2?.textContent).toBe('Paragraph 2');

      exitChildren();

      restore();
    });
  });

  describe('empty slot lists', () => {
    it('resolveChildren with empty array does not affect cursor', () => {
      // SSR: <div class="tabs"><button>Tab 1</button><button>Tab 2</button></div>
      // Component resolves children but finds no slots — empty list.
      const root = document.createElement('div');
      root.innerHTML = '<div class="tabs"><button>Tab 1</button><button>Tab 2</button></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Resolve empty children — no claim calls
      const emptySlots = resolveChildren(() => null);
      expect(emptySlots).toHaveLength(0);

      // Claim actual structure — cursor should be unaffected
      const tabs = claimElement('div');
      expect(tabs).not.toBeNull();
      expect(tabs?.className).toBe('tabs');

      enterChildren(tabs!);
      const btn1 = claimElement('button');
      expect(btn1).not.toBeNull();
      expect(btn1?.textContent).toBe('Tab 1');

      const btn2 = claimElement('button');
      expect(btn2).not.toBeNull();
      expect(btn2?.textContent).toBe('Tab 2');
      exitChildren();

      restore();
    });

    it('resolveChildren with undefined children does not affect cursor', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><span>Content</span></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      const resolved = resolveChildren(undefined);
      expect(resolved).toHaveLength(0);

      const div = claimElement('div');
      expect(div).not.toBeNull();

      enterChildren(div!);
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.textContent).toBe('Content');
      exitChildren();

      restore();
    });

    it('resolveChildren with empty nested arrays does not affect cursor', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><p>Text</p></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      const resolved = resolveChildren([[], [null, undefined], []]);
      expect(resolved).toHaveLength(0);

      const div = claimElement('div');
      expect(div).not.toBeNull();

      enterChildren(div!);
      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe('Text');
      exitChildren();

      restore();
    });
  });

  describe('deeply nested cursor stack interactions', () => {
    it('failed claims at multiple stack depths preserve all cursor positions', () => {
      // SSR: <div>
      //        <header><nav><a>Link</a></nav></header>
      //        <main><section><article><p>Deep</p></article></section></main>
      //        <footer><span>Footer</span></footer>
      //      </div>
      const root = document.createElement('div');
      root.innerHTML =
        '<div>' +
        '<header><nav><a>Link</a></nav></header>' +
        '<main><section><article><p>Deep</p></article></section></main>' +
        '<footer><span>Footer</span></footer>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Failed claims at root level
      expect(claimElement('slot-marker')).toBeNull();

      const div = claimElement('div');
      expect(div).not.toBeNull();
      enterChildren(div!);

      // Depth 1: header
      expect(claimElement('slot-marker')).toBeNull(); // failed claim at depth 1
      const header = claimElement('header');
      expect(header).not.toBeNull();

      enterChildren(header!);
      // Depth 2: nav inside header
      expect(claimElement('slot-marker')).toBeNull(); // failed claim at depth 2
      const nav = claimElement('nav');
      expect(nav).not.toBeNull();

      enterChildren(nav!);
      // Depth 3: link inside nav
      expect(claimElement('slot-marker')).toBeNull(); // failed claim at depth 3
      const a = claimElement('a');
      expect(a).not.toBeNull();
      expect(a?.textContent).toBe('Link');
      exitChildren(); // exit nav

      exitChildren(); // exit header

      // Back at depth 1 — cursor should be at <main>
      const main = claimElement('main');
      expect(main).not.toBeNull();

      enterChildren(main!);
      const section = claimElement('section');
      expect(section).not.toBeNull();

      enterChildren(section!);
      const article = claimElement('article');
      expect(article).not.toBeNull();

      enterChildren(article!);
      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe('Deep');
      exitChildren(); // exit article

      exitChildren(); // exit section
      exitChildren(); // exit main

      // Back at depth 1 — cursor should be at <footer>
      const footer = claimElement('footer');
      expect(footer).not.toBeNull();

      enterChildren(footer!);
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.textContent).toBe('Footer');
      exitChildren(); // exit footer

      exitChildren(); // exit div

      restore();
    });

    it('failed claims inside enterChildren/exitChildren at deepest level do not corrupt ancestors', () => {
      // This specifically tests that failed claims INSIDE a child scope
      // do not affect cursor positions in ancestor scopes.
      const root = document.createElement('div');
      root.innerHTML =
        '<div>' +
        '<div class="l1">' +
        '<div class="l2">' +
        '<div class="l3"></div>' +
        '</div>' +
        '</div>' +
        '<span class="sibling">After</span>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      const outer = claimElement('div');
      expect(outer).not.toBeNull();
      enterChildren(outer!);

      const l1 = claimElement('div');
      expect(l1).not.toBeNull();
      expect(l1?.className).toBe('l1');
      enterChildren(l1!);

      const l2 = claimElement('div');
      expect(l2).not.toBeNull();
      expect(l2?.className).toBe('l2');
      enterChildren(l2!);

      const l3 = claimElement('div');
      expect(l3).not.toBeNull();
      expect(l3?.className).toBe('l3');
      enterChildren(l3!);

      // At deepest level: multiple failed claims on empty element
      expect(claimElement('span')).toBeNull();
      expect(claimElement('p')).toBeNull();
      expect(claimElement('button')).toBeNull();
      expect(claimText()).toBeNull();

      exitChildren(); // exit l3
      exitChildren(); // exit l2
      exitChildren(); // exit l1

      // The sibling span at level 1 must still be claimable
      const sibling = claimElement('span');
      expect(sibling).not.toBeNull();
      expect(sibling?.className).toBe('sibling');
      expect(sibling?.textContent).toBe('After');

      exitChildren(); // exit outer

      restore();
    });
  });

  describe('transactional claim behavior', () => {
    it('sequential failed claims all restore to same cursor position', () => {
      // If claims are transactional, multiple consecutive failed claims
      // should all leave the cursor pointing at the same node.
      const root = document.createElement('div');
      root.innerHTML = '<div id="target"><span>Content</span></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Many consecutive failed claims — cursor must be restored each time
      for (let i = 0; i < 10; i++) {
        const result = claimElement(`nonexistent-${i}`);
        expect(result).toBeNull();
      }

      // The original first child should still be claimable
      const div = claimElement('div');
      expect(div).not.toBeNull();
      expect(div?.id).toBe('target');

      restore();
    });

    it('failed claim in child scope does not leak into parent scope', () => {
      // Tests that the cursor stack and per-scope cursor are independent.
      const root = document.createElement('div');
      root.innerHTML = '<div><span></span></div><p>After</p>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      const div = claimElement('div');
      expect(div).not.toBeNull();
      enterChildren(div!);

      // Claim the span
      const span = claimElement('span');
      expect(span).not.toBeNull();

      // Try to claim more — fails (only <span> exists)
      expect(claimElement('article')).toBeNull();

      exitChildren();

      // Parent scope cursor must be at <p> — unaffected by child scope failure
      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe('After');

      restore();
    });

    it('alternating failed text and element claims preserve cursor', () => {
      // Interleaved failed claimText and claimElement calls.
      const root = document.createElement('div');
      root.innerHTML = '<div><button>Click me</button></div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Alternating failed claims of different types
      expect(claimText()).toBeNull();
      expect(claimElement('span')).toBeNull();
      expect(claimText()).toBeNull();
      expect(claimElement('article')).toBeNull();

      // Real claim should still work
      const div = claimElement('div');
      expect(div).not.toBeNull();

      enterChildren(div!);
      const button = claimElement('button');
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe('Click me');
      exitChildren();

      restore();
    });
  });

  describe('resolveChildren during active hydration', () => {
    it('resolveChildren with thunk creating compiled JSX elements does not corrupt cursor', () => {
      // This is the key real-world scenario: a compound component's children thunk
      // runs during hydration and calls __element (which calls claimElement).
      // Those claim attempts fail because the SSR tree doesn't have the slot markers.
      // The return JSX must still be able to claim the actual SSR elements.
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="card">' +
        '<div class="card-header">Header</div>' +
        '<div class="card-body">Body</div>' +
        '<div class="card-footer">Footer</div>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Children thunk creates compiled JSX that tries to claim
      // These simulate what the compiler would emit for slot marker components
      const childrenThunk = (): ChildValue => {
        // Each __element call internally calls claimElement, which fails
        // because SSR has <div class="card">, not <span>
        const marker1 = claimElement('span'); // fails — <div class="card"> ≠ <span>
        const marker2 = claimElement('span'); // fails
        const marker3 = claimElement('span'); // fails

        // In real code, these would create fallback DOM nodes.
        // For this test, we just verify they failed.
        expect(marker1).toBeNull();
        expect(marker2).toBeNull();
        expect(marker3).toBeNull();

        return null;
      };

      // Step 1: Resolve children (runs the thunk, failed claims happen)
      resolveChildren(childrenThunk);

      // Step 2: Return JSX claims the actual SSR structure
      const card = claimElement('div');
      expect(card).not.toBeNull();
      expect(card?.className).toBe('card');

      enterChildren(card!);
      const header = claimElement('div');
      expect(header).not.toBeNull();
      expect(header?.className).toBe('card-header');
      expect(header?.textContent).toBe('Header');

      const body = claimElement('div');
      expect(body).not.toBeNull();
      expect(body?.className).toBe('card-body');
      expect(body?.textContent).toBe('Body');

      const footer = claimElement('div');
      expect(footer).not.toBeNull();
      expect(footer?.className).toBe('card-footer');
      expect(footer?.textContent).toBe('Footer');
      exitChildren();

      restore();
    });

    it('nested resolveChildren calls do not compound cursor corruption', () => {
      // Nested compound components: outer resolves children, one child is another
      // compound component that also resolves its own children.
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="outer">' +
        '<div class="inner">' +
        '<p>Nested content</p>' +
        '</div>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Outer component resolves children
      const outerChildren = (): ChildValue => {
        // Outer slot scan
        expect(claimElement('outer-slot')).toBeNull();

        // Inner component also resolves its children
        const innerChildren = (): ChildValue => {
          expect(claimElement('inner-slot')).toBeNull();
          return null;
        };
        resolveChildren(innerChildren);

        return null;
      };
      resolveChildren(outerChildren);

      // After both nested resolveChildren calls, the cursor must still
      // point at the first child of root
      const outer = claimElement('div');
      expect(outer).not.toBeNull();
      expect(outer?.className).toBe('outer');

      enterChildren(outer!);
      const inner = claimElement('div');
      expect(inner).not.toBeNull();
      expect(inner?.className).toBe('inner');

      enterChildren(inner!);
      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe('Nested content');
      exitChildren();

      exitChildren();

      restore();
    });

    it('resolveChildren with mixed node types in thunk', () => {
      // Children thunk returns a mix of elements, text, and null.
      // Only the element creation attempts will call claimElement.
      const root = document.createElement('div');
      root.innerHTML = '<ul><li>A</li><li>B</li></ul>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      const childrenThunk = (): ChildValue => {
        // Failed element claim
        expect(claimElement('slot-item')).toBeNull();
        // Text creation doesn't interact with hydration cursor
        return ['text-data', null, undefined, 42] as ChildValue;
      };

      const resolved = resolveChildren(childrenThunk);
      // resolveChildren converts strings and numbers to text nodes
      expect(resolved).toHaveLength(2); // 'text-data' + 42

      // Cursor should be intact
      const ul = claimElement('ul');
      expect(ul).not.toBeNull();

      enterChildren(ul!);
      const li1 = claimElement('li');
      expect(li1).not.toBeNull();
      expect(li1?.textContent).toBe('A');

      const li2 = claimElement('li');
      expect(li2).not.toBeNull();
      expect(li2?.textContent).toBe('B');
      exitChildren();

      restore();
    });
  });

  describe('compound component patterns', () => {
    it('Card with Header/Body/Footer pattern', () => {
      // Real-world pattern: Card resolves children, extracts Header/Body/Footer
      // slots, then builds the card structure using extracted data.
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="card" role="region">' +
        '<div class="card-header"><h2>Settings</h2></div>' +
        '<div class="card-body"><form><input /><button>Save</button></form></div>' +
        '<div class="card-footer"><span>Last saved: now</span></div>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Step 1: Card resolves its children prop to find slots
      // Each slot component (CardHeader, CardBody, CardFooter) tries to create
      // a marker element during resolution — these fail to claim from SSR.
      expect(claimElement('card-header-marker')).toBeNull();
      expect(claimElement('card-body-marker')).toBeNull();
      expect(claimElement('card-footer-marker')).toBeNull();

      // Step 2: Card's return JSX claims the actual structure
      const card = claimElement('div');
      expect(card).not.toBeNull();
      expect(card?.className).toBe('card');
      expect(card?.getAttribute('role')).toBe('region');

      enterChildren(card!);

      // Header
      const header = claimElement('div');
      expect(header).not.toBeNull();
      expect(header?.className).toBe('card-header');
      enterChildren(header!);
      const h2 = claimElement('h2');
      expect(h2).not.toBeNull();
      expect(h2?.textContent).toBe('Settings');
      exitChildren();

      // Body with nested form
      const body = claimElement('div');
      expect(body).not.toBeNull();
      expect(body?.className).toBe('card-body');
      enterChildren(body!);

      const form = claimElement('form');
      expect(form).not.toBeNull();
      enterChildren(form!);
      const input = claimElement('input');
      expect(input).not.toBeNull();
      const button = claimElement('button');
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe('Save');
      exitChildren(); // exit form

      exitChildren(); // exit body

      // Footer
      const footer = claimElement('div');
      expect(footer).not.toBeNull();
      expect(footer?.className).toBe('card-footer');
      enterChildren(footer!);
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.textContent).toBe('Last saved: now');
      exitChildren();

      exitChildren(); // exit card

      restore();
    });

    it('Tabs pattern with resolve-inspect-rebuild at tab and panel level', () => {
      // Tabs component resolves children to find Tab and TabPanel components,
      // extracts labels, then builds tablist + panels.
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="tabs">' +
        '<div role="tablist">' +
        '<button role="tab" aria-selected="true">Tab A</button>' +
        '<button role="tab" aria-selected="false">Tab B</button>' +
        '</div>' +
        '<div role="tabpanel">Panel A content</div>' +
        '</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Children resolution: scan for Tab/TabPanel markers
      expect(claimElement('tab-marker')).toBeNull();
      expect(claimElement('tab-marker')).toBeNull();
      expect(claimElement('panel-marker')).toBeNull();
      expect(claimElement('panel-marker')).toBeNull();

      // Build actual tabs UI
      const tabs = claimElement('div');
      expect(tabs).not.toBeNull();
      expect(tabs?.className).toBe('tabs');

      enterChildren(tabs!);

      const tablist = claimElement('div');
      expect(tablist).not.toBeNull();
      expect(tablist?.getAttribute('role')).toBe('tablist');

      enterChildren(tablist!);
      const tab1 = claimElement('button');
      expect(tab1).not.toBeNull();
      expect(tab1?.getAttribute('role')).toBe('tab');
      expect(tab1?.textContent).toBe('Tab A');

      const tab2 = claimElement('button');
      expect(tab2).not.toBeNull();
      expect(tab2?.getAttribute('role')).toBe('tab');
      expect(tab2?.textContent).toBe('Tab B');
      exitChildren(); // exit tablist

      const panel = claimElement('div');
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      expect(panel?.textContent).toBe('Panel A content');

      exitChildren(); // exit tabs

      restore();
    });

    it('siblings after a compound component are claimable', () => {
      // Ensures that after a compound component finishes its resolve-inspect-rebuild
      // cycle, sibling elements at the same level are still claimable.
      const root = document.createElement('div');
      root.innerHTML =
        '<div class="compound"><p>Inside</p></div>' +
        '<div class="sibling-1">First</div>' +
        '<div class="sibling-2">Second</div>';
      startHydration(root);
      const restore = suppressHydrationWarnings();

      // Compound component slot scan
      expect(claimElement('slot-marker')).toBeNull();
      expect(claimElement('slot-marker')).toBeNull();

      // Compound component claims its structure
      const compound = claimElement('div');
      expect(compound).not.toBeNull();
      expect(compound?.className).toBe('compound');

      enterChildren(compound!);
      const p = claimElement('p');
      expect(p).not.toBeNull();
      exitChildren();

      // Siblings after compound must be claimable
      const sib1 = claimElement('div');
      expect(sib1).not.toBeNull();
      expect(sib1?.className).toBe('sibling-1');

      const sib2 = claimElement('div');
      expect(sib2).not.toBeNull();
      expect(sib2?.className).toBe('sibling-2');

      restore();
    });
  });
});
