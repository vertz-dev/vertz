import { errorFallbackStyles } from '../styles/components';

interface ErrorFallbackProps {
  error: Error;
  retry: () => void;
}

export function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  return (
    <div className={errorFallbackStyles.container} data-testid="error-fallback">
      <h2 className={errorFallbackStyles.title}>Something went wrong</h2>
      <p className={errorFallbackStyles.message}>{error.message}</p>
      <button
        type="button"
        className={errorFallbackStyles.retryButton}
        onClick={retry}
        data-testid="error-retry"
      >
        Try again
      </button>
    </div>
  );
}
