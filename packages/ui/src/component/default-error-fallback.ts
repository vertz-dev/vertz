/** Props for error fallback components (shared by DefaultErrorFallback and route errorComponent). */
export interface ErrorFallbackProps {
  error: Error;
  retry: () => void;
}

/**
 * Framework-provided error fallback component.
 *
 * Renders a simple error display with the error message and a "Try again" button.
 * Works without any theme registered — uses inline styles for a clean default look.
 *
 * Exported from `@vertz/ui` (not `@vertz/ui/components`) because it is a
 * framework-level component, not a theme-provided one.
 *
 * Uses imperative DOM instead of JSX because `@vertz/ui` is a core package
 * without the Vertz compiler plugin — `.ts` files don't go through JSX transforms.
 */
export function DefaultErrorFallback({ error, retry }: ErrorFallbackProps): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'error-fallback');
  Object.assign(container.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    textAlign: 'center',
  });

  const heading = document.createElement('h2');
  heading.textContent = 'Something went wrong';
  Object.assign(heading.style, {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: 'inherit',
  });

  const message = document.createElement('p');
  message.textContent = error.message;
  Object.assign(message.style, {
    fontSize: '0.875rem',
    opacity: '0.7',
    marginBottom: '1rem',
    maxWidth: '24rem',
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('data-testid', 'error-retry');
  button.textContent = 'Try again';
  Object.assign(button.style, {
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: '1px solid currentColor',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '0.875rem',
  });
  button.addEventListener('click', retry);

  container.appendChild(heading);
  container.appendChild(message);
  container.appendChild(button);

  return container;
}
