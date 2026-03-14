import type { RenderElement, RenderText } from '@vertz/ui/internals';

/**
 * A lightweight scene-graph node that implements the RenderElement interface.
 * Used by the native adapter instead of DOM elements.
 */
export class NativeElement implements RenderElement {
  readonly tag: string;
  parent: NativeElement | null = null;
  children: (NativeElement | NativeTextNode)[] = [];

  private _attributes = new Map<string, string>();
  private _listeners = new Map<string, EventListener[]>();
  private _styleProps: { display: string; [key: string]: string } = { display: '' };

  readonly style: { display: string; [key: string]: string };
  readonly classList: { add(cls: string): void; remove(cls: string): void };

  constructor(tag: string) {
    this.tag = tag;

    // Proxy-based style object so property writes are captured
    const self = this;
    this.style = new Proxy(this._styleProps, {
      get(_target, prop: string) {
        return self._styleProps[prop] ?? '';
      },
      set(_target, prop: string, value: string) {
        self._styleProps[prop] = value;
        return true;
      },
    });

    this.classList = {
      add: (cls: string) => {
        const current = self._attributes.get('class') ?? '';
        const classes = current ? current.split(' ') : [];
        if (!classes.includes(cls)) {
          classes.push(cls);
          self._attributes.set('class', classes.join(' '));
        }
      },
      remove: (cls: string) => {
        const current = self._attributes.get('class') ?? '';
        const classes = current.split(' ').filter((c) => c !== cls);
        self._attributes.set('class', classes.join(' '));
      },
    };
  }

  setAttribute(name: string, value: string): void {
    this._attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this._attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this._attributes.get(name) ?? null;
  }

  addEventListener(event: string, handler: EventListener): void {
    const list = this._listeners.get(event) ?? [];
    list.push(handler);
    this._listeners.set(event, list);
  }

  removeEventListener(event: string, handler: EventListener): void {
    const list = this._listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  /** Number of listeners for an event type (for testing). */
  listenerCount(event: string): number {
    return this._listeners.get(event)?.length ?? 0;
  }

  /** Dispatch an event to all registered listeners. */
  dispatchEvent(event: string, data: Event): void {
    const list = this._listeners.get(event);
    if (!list) return;
    for (const handler of list) {
      handler(data);
    }
  }

  appendChild(child: NativeElement | NativeTextNode): void {
    // Remove from previous parent
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
  }

  removeChild(child: NativeElement | NativeTextNode): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parent = null;
    }
  }

  insertBefore(
    newChild: NativeElement | NativeTextNode,
    refChild: NativeElement | NativeTextNode | null,
  ): void {
    if (newChild.parent) {
      newChild.parent.removeChild(newChild);
    }
    if (refChild === null) {
      this.appendChild(newChild);
      return;
    }
    const idx = this.children.indexOf(refChild);
    if (idx === -1) {
      this.appendChild(newChild);
      return;
    }
    newChild.parent = this;
    this.children.splice(idx, 0, newChild);
  }

  replaceChild(
    newChild: NativeElement | NativeTextNode,
    oldChild: NativeElement | NativeTextNode,
  ): void {
    const idx = this.children.indexOf(oldChild);
    if (idx === -1) return;
    if (newChild.parent) {
      newChild.parent.removeChild(newChild);
    }
    oldChild.parent = null;
    newChild.parent = this;
    this.children[idx] = newChild;
  }
}

/**
 * A text node in the native scene graph.
 */
export class NativeTextNode implements RenderText {
  parent: NativeElement | null = null;
  data: string;

  constructor(text: string) {
    this.data = text;
  }
}
