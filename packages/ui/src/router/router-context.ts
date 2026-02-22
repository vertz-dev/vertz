import type { Context } from '../component/context';
import { createContext, useContext } from '../component/context';
import type { Router } from './navigate';

export const RouterContext: Context<Router> = createContext<Router>();

export function useRouter(): Router {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useRouter() must be called within RouterContext.Provider');
  }
  return router;
}
