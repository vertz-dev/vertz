import { css, token } from '@vertz/ui';

export const styles = css({
  button: { padding: token.spacing[4], '&:hover': { backgroundColor: token.color.primary[500] }, '&:focus': { outline: 'none' }, '&:disabled': { opacity: '0.5' } },
});
