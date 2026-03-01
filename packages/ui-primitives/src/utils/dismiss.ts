/**
 * Shared dismiss utility for floating elements.
 * Handles click-outside and Escape key dismissal.
 */

export interface DismissOptions {
  onDismiss: () => void;
  insideElements: HTMLElement[];
  escapeKey?: boolean;
  clickOutside?: boolean;
}

/**
 * Set up dismissal listeners (click-outside + Escape key).
 * Returns a cleanup function that removes all listeners.
 */
export function createDismiss(options: DismissOptions): () => void {
  const { onDismiss, insideElements, escapeKey = true, clickOutside = true } = options;

  function handlePointerDown(event: Event): void {
    const target = event.target as Node;
    const isInside = insideElements.some((el) => el.contains(target));
    if (!isInside) {
      onDismiss();
    }
  }

  function handleKeyDown(event: Event): void {
    if ((event as KeyboardEvent).key === 'Escape') {
      onDismiss();
    }
  }

  if (clickOutside) {
    document.addEventListener('pointerdown', handlePointerDown, true);
  }
  if (escapeKey) {
    document.addEventListener('keydown', handleKeyDown);
  }

  return function cleanup(): void {
    if (clickOutside) {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    }
    if (escapeKey) {
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
}
