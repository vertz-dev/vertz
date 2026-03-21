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
 */
export function DefaultErrorFallback({ error, retry }: ErrorFallbackProps): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'error-fallback');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.padding = '2rem';
  container.style.textAlign = 'center';

  const heading = document.createElement('h2');
  heading.textContent = 'Something went wrong';
  heading.style.fontSize = '1.25rem';
  heading.style.fontWeight = '600';
  heading.style.marginBottom = '0.5rem';
  heading.style.color = 'inherit';

  const message = document.createElement('p');
  message.textContent = error.message;
  message.style.fontSize = '0.875rem';
  message.style.opacity = '0.7';
  message.style.marginBottom = '1rem';
  message.style.maxWidth = '24rem';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Try again';
  button.setAttribute('data-testid', 'error-retry');
  button.style.padding = '0.5rem 1rem';
  button.style.borderRadius = '0.375rem';
  button.style.border = '1px solid currentColor';
  button.style.background = 'transparent';
  button.style.cursor = 'pointer';
  button.style.fontSize = '0.875rem';
  button.addEventListener('click', retry);

  container.appendChild(heading);
  container.appendChild(message);
  container.appendChild(button);

  return container;
}
