import { css, token } from '@vertz/ui';

export const styles = css({
  link: { color: token.color.primary, '&:hover': { color: token.color.primary[700], backgroundColor: token.color.primary[100] }, '&:focus': { outline: 'none' }, '&:active': { opacity: '0.8' } },
});
