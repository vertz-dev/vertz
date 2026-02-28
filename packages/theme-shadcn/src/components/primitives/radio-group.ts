import type { RadioElements, RadioOptions, RadioState } from '@vertz/ui-primitives';
import { Radio } from '@vertz/ui-primitives';

interface RadioGroupStyleClasses {
  readonly root: string;
  readonly item: string;
  readonly indicator: string;
}

/** SVG circle icon for selected radio state. */
function createCircleIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '8');
  svg.setAttribute('height', '8');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('fill', 'currentColor');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '4');
  circle.setAttribute('cy', '4');
  circle.setAttribute('r', '4');
  svg.appendChild(circle);
  return svg;
}

export interface ThemedRadioGroupResult extends RadioElements {
  state: RadioState;
  Item: (value: string, label?: string) => HTMLDivElement;
}

export function createThemedRadioGroup(
  styles: RadioGroupStyleClasses,
): (options?: RadioOptions) => ThemedRadioGroupResult {
  return function themedRadioGroup(options?: RadioOptions): ThemedRadioGroupResult {
    const result = Radio.Root(options);
    result.root.classList.add(styles.root);
    const originalItem = result.Item;

    return {
      root: result.root,
      state: result.state,
      Item: (value: string, label?: string) => {
        // Create the primitive item (div with role="radio" and text)
        const item = originalItem(value, label);

        // Clear the text from the item — we'll put it in a separate label
        const labelText = item.textContent ?? '';
        item.textContent = '';

        // Style the item as the radio circle
        item.classList.add(styles.item);
        item.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 0; background: transparent;';

        // Create indicator with circle icon
        const indicator = document.createElement('span');
        indicator.classList.add(styles.indicator);
        const dataState = item.getAttribute('data-state') ?? 'unchecked';
        indicator.setAttribute('data-state', dataState);
        indicator.appendChild(createCircleIcon());
        item.appendChild(indicator);

        // Sync indicator data-state
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.attributeName === 'data-state') {
              const newState = item.getAttribute('data-state') ?? 'unchecked';
              indicator.setAttribute('data-state', newState);
            }
          }
        });
        observer.observe(item, { attributes: true, attributeFilter: ['data-state'] });

        // Wrap in a row: [radio circle] [label text]
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;';

        // Move item out of root temporarily, wrap, put wrapper in root
        item.remove();
        wrapper.appendChild(item);

        if (labelText) {
          const labelEl = document.createElement('label');
          labelEl.textContent = labelText;
          labelEl.style.cssText = 'font-size: 0.875rem; color: var(--color-foreground); cursor: pointer;';
          labelEl.addEventListener('click', () => item.click());
          wrapper.appendChild(labelEl);
        }

        result.root.appendChild(wrapper);
        return wrapper as HTMLDivElement;
      },
    };
  };
}
