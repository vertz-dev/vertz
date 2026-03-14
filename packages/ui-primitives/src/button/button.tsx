/**
 * Button primitive - accessible button with keyboard activation.
 * Supports Enter/Space activation.
 */

import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { handleActivation } from '../utils/keyboard';

export interface ButtonOptions extends ElementAttrs {
  disabled?: boolean;
  onClick?: () => void;
}

function ButtonRoot(options: ButtonOptions = {}) {
  const { disabled = false, onClick, ...attrs } = options;

  const el = (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => {
        if (disabled) return;
        onClick?.();
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (disabled) return;
        handleActivation(event, () => {
          (event.target as HTMLButtonElement).click();
        });
      }}
    />
  ) as HTMLButtonElement;

  applyAttrs(el, attrs);
  return el;
}

export const Button: { Root: (options?: ButtonOptions) => HTMLButtonElement } = {
  Root: ButtonRoot,
};
