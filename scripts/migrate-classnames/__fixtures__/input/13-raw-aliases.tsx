import { css } from '@vertz/ui';

export const styles = css({
  button: [
    'transition:colors',
    'tracking:tight',
    'tracking:wider',
    'grid-cols:3',
    'aspect:video',
    'top:4',
    'left:2',
  ],
  overlay: ['transition:all', 'transition:shadow', 'tracking:widest'],
  panel: ['grid-cols:2', 'aspect:square', 'inset:8'],
});
