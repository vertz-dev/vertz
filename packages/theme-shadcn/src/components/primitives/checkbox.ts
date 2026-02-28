import type { CheckboxElements, CheckboxOptions, CheckboxState } from '@vertz/ui-primitives';
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

export function createThemedCheckbox(
  styles: CheckboxStyleClasses,
): (options?: CheckboxOptions) => CheckboxElements & { state: CheckboxState } {
  return function themedCheckbox(options?: CheckboxOptions) {
    const result = Checkbox.Root(options);
    result.root.classList.add(styles.root);

    // Create indicator element with checkmark icon
    const indicator = document.createElement('span');
    indicator.classList.add(styles.indicator);
    const dataState = result.root.getAttribute('data-state') ?? 'unchecked';
    indicator.setAttribute('data-state', dataState);
    indicator.appendChild(createCheckIcon());
    result.root.appendChild(indicator);

    // Sync indicator data-state when checkbox state changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-state') {
          const newState = result.root.getAttribute('data-state') ?? 'unchecked';
          indicator.setAttribute('data-state', newState);
        }
      }
    });
    observer.observe(result.root, { attributes: true, attributeFilter: ['data-state'] });

    return result;
  };
}
