import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface SpinnerProps {
  label?: string;
}

export function Spinner(props: SpinnerProps): TuiNode {
  // Use a simple first frame for static render.
  // Animation requires the scheduler to be running (tui.mount).
  const frame = SPINNER_FRAMES[0];

  if (props.label) {
    return jsx('Box', {
      direction: 'row',
      gap: 1,
      children: [
        jsx('Text', { color: 'cyan', children: frame }),
        jsx('Text', { children: props.label }),
      ],
    });
  }

  return jsx('Text', { color: 'cyan', children: frame });
}
