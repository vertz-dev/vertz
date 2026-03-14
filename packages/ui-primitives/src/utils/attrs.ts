export interface ElementAttrs {
  class?: string;
  id?: string;
  style?: string;
  title?: string;
  role?: string;
  tabindex?: number | string;
  hidden?: boolean | string;
  autofocus?: boolean;
  [key: `data-${string}`]: string | undefined;
  [key: `aria-${string}`]: string | undefined;
}

export function applyAttrs(el: HTMLElement, attrs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'class') {
      const existing = el.getAttribute('class');
      el.setAttribute('class', existing ? `${existing} ${String(value)}` : String(value));
    } else if (key === 'style') {
      const existing = el.getAttribute('style');
      el.setAttribute('style', existing ? `${existing}; ${String(value)}` : String(value));
    } else {
      el.setAttribute(key, String(value));
    }
  }
}
