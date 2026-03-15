import type { CheckboxOptions, CheckedState } from '@vertz/ui-primitives';
import { Checkbox } from '@vertz/ui-primitives';

interface CheckboxStyleClasses {
  readonly root: string;
  readonly indicator: string;
}

/** SVG checkmark icon for checked state. */
function createCheckIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M20 6L9 17l-5-5');
  svg.appendChild(path);
  return svg;
}

function dataStateForChecked(checked: CheckedState): string {
  if (checked === 'mixed') return 'indeterminate';
  return checked ? 'checked' : 'unchecked';
}

export function createThemedCheckbox(
  styles: CheckboxStyleClasses,
): (options?: CheckboxOptions) => HTMLButtonElement {
  return function themedCheckbox(options?: CheckboxOptions) {
    // Create indicator first so we can reference it in the callback
    const indicator = document.createElement('span');
    indicator.classList.add(styles.indicator);

    const root = Checkbox.Root({
      ...options,
      onCheckedChange: (checked) => {
        indicator.setAttribute('data-state', dataStateForChecked(checked));
        options?.onCheckedChange?.(checked);
      },
    });
    root.classList.add(styles.root);

    const dataState = root.getAttribute('data-state') ?? 'unchecked';
    indicator.setAttribute('data-state', dataState);
    indicator.appendChild(createCheckIcon());
    root.appendChild(indicator);

    return root;
  };
}
