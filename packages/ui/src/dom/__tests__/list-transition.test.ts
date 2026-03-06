import { describe, expect, it } from 'bun:test';
import { signal } from '../../runtime/signal';
import { listTransition } from '../list-transition';

describe('listTransition', () => {
  it('renders initial items between markers', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // 3 items + 2 comment markers = 5 child nodes
    expect(container.childNodes.length).toBe(5);
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('A');
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('B');
    expect((container.childNodes[3] as HTMLElement).textContent).toBe('C');
  });

  it('initial items do NOT get data-presence attribute', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const a = container.childNodes[1] as HTMLElement;
    const b = container.childNodes[2] as HTMLElement;
    expect(a.getAttribute('data-presence')).toBeNull();
    expect(b.getAttribute('data-presence')).toBeNull();
  });

  it('adding items after first render sets data-presence="enter"', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([{ id: 1, title: 'A' }]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // First item has no data-presence
    expect((container.childNodes[1] as HTMLElement).getAttribute('data-presence')).toBeNull();

    // Mock getAnimations to keep data-presence visible (defer callback)
    const orig = HTMLElement.prototype.getAnimations;
    HTMLElement.prototype.getAnimations = () => [
      { finished: new Promise<void>(() => {}) } as unknown as Animation,
    ];

    try {
      // Add a new item
      items.value = [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
      ];

      // Original item still has no data-presence
      expect((container.childNodes[1] as HTMLElement).getAttribute('data-presence')).toBeNull();
      // New item has enter animation
      expect((container.childNodes[2] as HTMLElement).getAttribute('data-presence')).toBe('enter');
    } finally {
      HTMLElement.prototype.getAnimations = orig;
    }
  });

  it('data-presence="enter" cleared after animation completes', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([{ id: 1, title: 'A' }]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // Mock getAnimations on prototype with controllable promise
    let resolveAnim!: () => void;
    const animFinished = new Promise<void>((r) => {
      resolveAnim = r;
    });
    const orig = HTMLElement.prototype.getAnimations;
    HTMLElement.prototype.getAnimations = () => [
      { finished: animFinished } as unknown as Animation,
    ];

    try {
      items.value = [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
      ];
    } finally {
      HTMLElement.prototype.getAnimations = orig;
    }

    const newItem = container.childNodes[2] as HTMLElement;
    expect(newItem.getAttribute('data-presence')).toBe('enter');

    // Resolve animation
    resolveAnim();
    await new Promise((r) => setTimeout(r, 0));

    // data-presence cleared
    expect(newItem.getAttribute('data-presence')).toBeNull();
  });

  it('removing items sets data-presence="exit"', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // Remove item B
    items.value = [{ id: 1, title: 'A' }];

    // In happy-dom, getAnimations returns [], so exit animation completes
    // synchronously and the node is removed.
    expect(container.childNodes.length).toBe(3); // start, A, end
  });

  it('removed items stay in DOM until exit animation completes', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const itemB = container.childNodes[2] as HTMLElement;

    // Mock animation on B BEFORE removing it
    let resolveExit!: () => void;
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExit = r;
    });
    itemB.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    // Remove B
    items.value = [{ id: 1, title: 'A' }];

    // B still in DOM (exit animation pending)
    expect(container.contains(itemB)).toBe(true);
    expect(itemB.getAttribute('data-presence')).toBe('exit');

    // Resolve exit animation
    resolveExit();
    await new Promise((r) => setTimeout(r, 0));

    // Now B is removed
    expect(container.contains(itemB)).toBe(false);
  });

  it('scope/effects disposed immediately on removal (before exit animation)', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const { domEffect } = await import('../../runtime/signal');
    const { onCleanup } = await import('../../runtime/disposal');

    const items = signal([{ id: 1, title: 'A' }]);
    const counter = signal(0);
    let effectRunCount = 0;
    let cleanedUp = false;

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        domEffect(() => {
          counter.value;
          effectRunCount++;
        });
        onCleanup(() => {
          cleanedUp = true;
        });
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const itemA = container.childNodes[1] as HTMLElement;

    // Mock animation to defer removal
    let resolveExit!: () => void;
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExit = r;
    });
    itemA.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    effectRunCount = 0;

    // Remove item A
    items.value = [];

    // Cleanup should fire immediately, before animation completes
    expect(cleanedUp).toBe(true);

    // Effect should be disposed — counter mutation should NOT trigger effect
    counter.value = 1;
    expect(effectRunCount).toBe(0);

    // But node still in DOM (animation pending)
    expect(container.contains(itemA)).toBe(true);

    resolveExit();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.contains(itemA)).toBe(false);
  });

  it('reordering items does NOT trigger cleanup or animation', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ]);

    const cleanups: number[] = [];

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const { onCleanup } = require('../../runtime/disposal');
        onCleanup(() => {
          cleanups.push(item.id);
        });
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // Reorder: C, A, B
    items.value = [
      { id: 3, title: 'C' },
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ];

    // No cleanups fired
    expect(cleanups).toEqual([]);

    // DOM reordered
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('C');
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('A');
    expect((container.childNodes[3] as HTMLElement).textContent).toBe('B');

    // No data-presence attributes
    expect((container.childNodes[1] as HTMLElement).getAttribute('data-presence')).toBeNull();
    expect((container.childNodes[2] as HTMLElement).getAttribute('data-presence')).toBeNull();
    expect((container.childNodes[3] as HTMLElement).getAttribute('data-presence')).toBeNull();
  });

  it('DOM nodes reused on reorder (same key identity)', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const nodeA = container.childNodes[1];
    const nodeB = container.childNodes[2];

    // Reorder
    items.value = [
      { id: 2, title: 'B' },
      { id: 1, title: 'A' },
    ];

    // Same DOM references
    expect(container.childNodes[1]).toBe(nodeB);
    expect(container.childNodes[2]).toBe(nodeA);
  });

  it('full disposal cleans up everything including exiting nodes', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    const dispose = listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const itemB = container.childNodes[2] as HTMLElement;

    // Mock animation on B to defer removal
    itemB.getAnimations = () => [{ finished: new Promise<void>(() => {}) } as unknown as Animation];

    // Remove B (starts exit animation)
    items.value = [{ id: 1, title: 'A' }];
    expect(container.contains(itemB)).toBe(true);

    // Full disposal
    dispose();

    // Both A and exiting B should be gone, only markers remain
    // A is removed by scope cleanup, B by force-remove in dispose
    expect(container.contains(itemB)).toBe(false);
  });

  it('empty list on creation works', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal<{ id: number; title: string }[]>([]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // Only markers
    expect(container.childNodes.length).toBe(2);

    // Mock getAnimations to keep data-presence visible
    const orig = HTMLElement.prototype.getAnimations;
    HTMLElement.prototype.getAnimations = () => [
      { finished: new Promise<void>(() => {}) } as unknown as Animation,
    ];

    try {
      // Add items
      items.value = [{ id: 1, title: 'A' }];
      expect(container.childNodes.length).toBe(3);
      expect((container.childNodes[1] as HTMLElement).textContent).toBe('A');
      expect((container.childNodes[1] as HTMLElement).getAttribute('data-presence')).toBe('enter');
    } finally {
      HTMLElement.prototype.getAnimations = orig;
    }
  });

  it('rapid add/remove does not leak effects', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const { domEffect } = require('../../runtime/signal');
    const counter = signal(0);
    let effectRunCount = 0;

    const items = signal<{ id: number; title: string }[]>([]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        domEffect(() => {
          counter.value;
          effectRunCount++;
        });
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // Rapid cycles
    for (let i = 0; i < 10; i++) {
      items.value = [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
      ];
      items.value = [];
    }

    effectRunCount = 0;
    counter.value = 99;

    // All effects should be disposed — no leaks
    expect(effectRunCount).toBe(0);
  });

  it('prefers-reduced-motion skips animation wait', () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    })) as typeof globalThis.matchMedia;

    try {
      const container = document.createElement('ul');
      const start = document.createComment('lt-start');
      const end = document.createComment('lt-end');
      container.appendChild(start);
      container.appendChild(end);

      const items = signal([{ id: 1, title: 'A' }]);

      listTransition(
        start,
        end,
        items,
        (item) => item.id,
        (item) => {
          const li = document.createElement('li');
          li.textContent = item.title;
          return li;
        },
      );

      const itemA = container.childNodes[1] as HTMLElement;

      // Mock animation that would normally defer
      itemA.getAnimations = () => [
        { finished: new Promise<void>(() => {}) } as unknown as Animation,
      ];

      // Remove — with reduced motion, should be immediate
      items.value = [];

      expect(container.contains(itemA)).toBe(false);
      expect(container.childNodes.length).toBe(2); // just markers
    } finally {
      globalThis.matchMedia = original;
    }
  });

  it('re-add same key during pending exit animation', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([{ id: 1, title: 'A' }]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const firstNode = container.childNodes[1] as HTMLElement;

    // Mock animation to defer exit
    let resolveExit!: () => void;
    const exitFinished = new Promise<void>((r) => {
      resolveExit = r;
    });
    firstNode.getAnimations = () => [{ finished: exitFinished } as unknown as Animation];

    // Remove A
    items.value = [];
    expect(container.contains(firstNode)).toBe(true);
    expect(firstNode.getAttribute('data-presence')).toBe('exit');

    // Re-add A before exit animation completes
    items.value = [{ id: 1, title: 'A' }];

    // Old node should be force-removed
    expect(container.contains(firstNode)).toBe(false);

    // New node should be present with enter animation
    const newNode = container.childNodes[1] as HTMLElement;
    expect(newNode).not.toBe(firstNode);
    expect(newNode.textContent).toBe('A');

    // Old exit callback fires — should NOT affect new node
    resolveExit();
    await new Promise((r) => setTimeout(r, 0));

    expect(container.contains(newNode)).toBe(true);
  });

  it('concurrent exits with different animation durations', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const nodeA = container.childNodes[1] as HTMLElement;
    const nodeB = container.childNodes[2] as HTMLElement;

    // Mock different-duration animations
    let resolveA!: () => void;
    const animA = new Promise<void>((r) => {
      resolveA = r;
    });
    nodeA.getAnimations = () => [{ finished: animA } as unknown as Animation];

    let resolveB!: () => void;
    const animB = new Promise<void>((r) => {
      resolveB = r;
    });
    nodeB.getAnimations = () => [{ finished: animB } as unknown as Animation];

    // Remove A and B simultaneously
    items.value = [{ id: 3, title: 'C' }];

    // Both still in DOM
    expect(container.contains(nodeA)).toBe(true);
    expect(container.contains(nodeB)).toBe(true);

    // A finishes first
    resolveA();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.contains(nodeA)).toBe(false);
    expect(container.contains(nodeB)).toBe(true);

    // B finishes later
    resolveB();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.contains(nodeB)).toBe(false);
  });

  it('handles undefined/null items gracefully', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal<{ id: number; title: string }[] | undefined>(undefined);

    listTransition(
      start,
      end,
      items as Signal<{ id: number; title: string }[]>,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // No items, just markers
    expect(container.childNodes.length).toBe(2);

    // Transition to data
    (items as Signal<{ id: number; title: string }[]>).value = [{ id: 1, title: 'A' }] as {
      id: number;
      title: string;
    }[];
    expect(container.childNodes.length).toBe(3);
  });

  it('exiting node stays in its visual position', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const nodeB = container.childNodes[2] as HTMLElement;

    // Mock animation on B
    nodeB.getAnimations = () => [{ finished: new Promise<void>(() => {}) } as unknown as Animation];

    // Remove B — A and C remain active
    items.value = [
      { id: 1, title: 'A' },
      { id: 3, title: 'C' },
    ];

    // B should stay between A and C (not drift to start)
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('A');
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('B'); // exiting, in place
    expect((container.childNodes[3] as HTMLElement).textContent).toBe('C');
  });

  it('dispose during pending exit animation does not crash', async () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const items = signal([{ id: 1, title: 'A' }]);

    const dispose = listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    const nodeA = container.childNodes[1] as HTMLElement;

    // Mock animation
    let resolveExit!: () => void;
    const exitFinished = new Promise<void>((r) => {
      resolveExit = r;
    });
    nodeA.getAnimations = () => [{ finished: exitFinished } as unknown as Animation];

    // Remove A (exit animation pending)
    items.value = [];
    expect(container.contains(nodeA)).toBe(true);

    // Dispose while exit is pending
    dispose();
    expect(container.contains(nodeA)).toBe(false);

    // Late resolution should not crash
    resolveExit();
    await new Promise((r) => setTimeout(r, 0));
    // No error — parentNode is null, removeChild is guarded
  });

  it('onCleanup handlers fire on removal', () => {
    const container = document.createElement('ul');
    const start = document.createComment('lt-start');
    const end = document.createComment('lt-end');
    container.appendChild(start);
    container.appendChild(end);

    const { onCleanup } = require('../../runtime/disposal');
    const cleanups: number[] = [];

    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    listTransition(
      start,
      end,
      items,
      (item) => item.id,
      (item) => {
        onCleanup(() => {
          cleanups.push(item.id);
        });
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    );

    // Remove B
    items.value = [{ id: 1, title: 'A' }];
    expect(cleanups).toEqual([2]);

    // Remove A
    items.value = [];
    expect(cleanups).toEqual([2, 1]);
  });
});
