/**
 * Button primitive - accessible button with keyboard activation.
 * Supports Enter/Space activation.
 */

import { handleActivation } from '../utils/keyboard';

export interface ButtonOptions {
  disabled?: boolean;
  onClick?: () => void;
}

function ButtonRoot(options: ButtonOptions = {}) {
  const { disabled = false, onClick } = options;

  return (
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
}

export const Button: { Root: (options?: ButtonOptions) => HTMLButtonElement } = {
  Root: ButtonRoot,
};
