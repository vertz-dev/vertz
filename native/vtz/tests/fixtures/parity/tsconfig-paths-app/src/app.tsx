import { greet } from '@/utils';

export function App() {
  return <div id="root">{greet('World')}</div>;
}
