export interface ElementAttrs {
  className?: string;
  /** @deprecated Use `className` instead. */
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
  // Resolve className vs class: className takes precedence
  const resolvedClass = attrs.className ?? attrs.class;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'className' || key === 'class') {
      // className takes precedence; skip class if className was provided
      if (key === 'class' && attrs.className != null) continue;
      // Merge with existing DOM class
      const existing = el.getAttribute('class');
      const classValue = String(resolvedClass);
      el.setAttribute('class', existing ? `${existing} ${classValue}` : classValue);
      continue;
    } else if (key === 'style') {
      const existing = el.getAttribute('style');
      el.setAttribute('style', existing ? `${existing}; ${String(value)}` : String(value));
    } else {
      el.setAttribute(key, String(value));
    }
  }
}
