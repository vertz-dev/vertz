import { errorFallbackStyles } from '../styles/components';

interface ErrorFallbackProps {
  error: unknown;
  retry: () => void;
}

export function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className={errorFallbackStyles.container}>
      <h2 className={errorFallbackStyles.title}>Something went wrong</h2>
      <p className={errorFallbackStyles.message}>{message}</p>
      <button className={errorFallbackStyles.retryButton} onClick={retry}>
        Try again
      </button>
    </div>
  );
}
