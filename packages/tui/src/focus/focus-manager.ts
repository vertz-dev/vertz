import { createContext, useContext } from '@vertz/ui';

interface FocusState {
  focused: boolean;
}

/** Focus context for interactive components. */
export const FocusContext: import('@vertz/ui').Context<FocusState> = createContext<FocusState>();

/**
 * Hook to check if the current component has focus.
 * Returns { focused: boolean }.
 */
export function useFocus(): FocusState {
  const ctx = useContext(FocusContext);
  return ctx ?? { focused: false };
}
