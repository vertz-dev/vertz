import { onAnimationsComplete } from '../dom/animation';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';

export interface PresenceProps {
  when: boolean;
  children: () => HTMLElement;
}

/**
 * Presence component for mount/unmount animations.
 * Defers unmounting until CSS exit animations complete.
 *
 * Props are accessed as getters (not destructured) so the compiler-generated
 * reactive getters are tracked by domEffect.
 */
export function Presence(props: PresenceProps): Node {
  const anchor = document.createComment('presence');
  let currentNode: HTMLElement | null = null;
  let exitingNode: HTMLElement | null = null;
  let branchCleanups: DisposeFn[] = [];
  let generation = 0;

  const outerScope = pushScope();
  try {
    domEffect(() => {
      const show = props.when;

      if (show && !currentNode) {
        // Invalidate any pending exit callback
        generation++;

        // Force-remove any exiting element from a previous exit animation
        if (exitingNode?.parentNode) {
          exitingNode.parentNode.removeChild(exitingNode);
          exitingNode = null;
        }

        // Mount
        const scope = pushScope();
        const child = props.children();
        popScope();

        if (!(child instanceof HTMLElement)) {
          runCleanups(scope);
          throw new Error(
            'Presence requires a single HTMLElement child. Wrap multiple children in a container element.',
          );
        }

        branchCleanups = scope;

        currentNode = child;
        child.setAttribute('data-presence', 'enter');
        anchor.parentNode?.insertBefore(currentNode, anchor.nextSibling);

        // Remove data-presence after enter animation completes
        onAnimationsComplete(child, () => {
          if (currentNode === child) {
            child.removeAttribute('data-presence');
          }
        });
      } else if (!show && currentNode) {
        // Freeze — dispose reactive effects immediately
        const gen = ++generation;
        const exitingEl = currentNode;
        currentNode = null;
        exitingNode = exitingEl;

        runCleanups(branchCleanups);
        branchCleanups = [];

        // Animate — element is now static
        exitingEl.setAttribute('data-presence', 'exit');
        void exitingEl.offsetHeight; // force reflow

        // Remove after animation
        onAnimationsComplete(exitingEl, () => {
          if (generation === gen) {
            exitingEl.parentNode?.removeChild(exitingEl);
            exitingNode = null;
          }
        });
      }
    });
  } finally {
    popScope();
  }

  const dispose: DisposeFn = () => {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
    if (currentNode?.parentNode) {
      currentNode.parentNode.removeChild(currentNode);
      currentNode = null;
    }
  };

  _tryOnCleanup(dispose);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);
  if (currentNode) {
    fragment.appendChild(currentNode);
  }

  return Object.assign(fragment, { dispose });
}
