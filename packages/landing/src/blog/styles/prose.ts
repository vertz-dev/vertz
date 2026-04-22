import { css, token } from '@vertz/ui';

/**
 * Prose container — applied to the `article` element that hosts the
 * rendered MDX body. Targets every descendant that the MDX compiler
 * produces: h2/h3/h4, p, ul/ol/li, blockquote, hr, a, inline code.
 *
 * Layout invariants (per `plans/2947-blog.md`):
 *   - body max-width 640px (68ch feel at 17px)
 *   - heading scroll-margin-top 80px (sticky Nav height)
 *   - hr renders as three dots · · ·
 */
export const prose = css({
  prose: {
    fontSize: '17px',
    lineHeight: '1.7',
    fontFamily: "'DM Sans', 'DM Sans Fallback', sans-serif",
    color: token.color.gray[200],
    textWrap: 'pretty',

    '& > *': { maxWidth: '640px', marginInline: 'auto' },

    '& h2': {
      fontFamily: "'DM Sans', 'DM Sans Fallback', sans-serif",
      fontSize: '1.75rem',
      fontWeight: '600',
      lineHeight: '1.25',
      color: token.color.gray[100],
      marginTop: '3rem',
      marginBottom: '1rem',
      scrollMarginTop: '80px',
      textWrap: 'balance',
    },
    '& h3': {
      fontSize: '1.25rem',
      fontWeight: '600',
      lineHeight: '1.3',
      color: token.color.gray[100],
      marginTop: '2rem',
      marginBottom: '0.75rem',
      scrollMarginTop: '80px',
    },
    '& h4': {
      fontSize: '1.05rem',
      fontWeight: '600',
      color: token.color.gray[100],
      marginTop: '1.5rem',
      marginBottom: '0.5rem',
    },
    '& p': {
      marginBlock: '1.1rem',
      color: token.color.gray[300],
    },
    '& :not(pre) > code': {
      fontFamily: "'JetBrains Mono', 'JetBrains Mono Fallback', monospace",
      fontSize: '0.9em',
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      padding: '0.15rem 0.35rem',
      borderRadius: token.radius.sm,
      color: token.color.gray[100],
    },
    '& ul, & ol': {
      marginBlock: '1rem',
      paddingLeft: '1.5rem',
      color: token.color.gray[300],
    },
    '& li': {
      marginBottom: '0.5rem',
    },
    '& ul': { listStyleType: 'disc' },
    '& ol': { listStyleType: 'decimal' },
    '& ul li::marker, & ol li::marker': { color: token.color.orange[400] },
    '& blockquote': {
      borderLeft: `3px solid ${token.color.orange[400]}`,
      paddingLeft: '1.5rem',
      marginBlock: '1.5rem',
      fontStyle: 'italic',
      color: token.color.gray[400],
    },
    '& hr': {
      border: 'none',
      textAlign: 'center',
      marginBlock: '3rem',
      color: token.color.gray[500],
      '&::before': { content: '"· · ·"', letterSpacing: '0.5rem' },
    },
    '& a': {
      color: token.color.gray[100],
      textDecoration: 'underline',
      textDecorationColor: token.color.gray[600],
      textUnderlineOffset: '3px',
      transition: 'text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
    '& a:hover': {
      textDecorationColor: token.color.gray[200],
    },
    '& pre': {
      // Phase 2 Task 5 extends this; here we just guarantee horizontal scroll.
      overflowX: 'auto',
      maxWidth: '100%',
      borderRadius: token.radius.md,
      marginBlock: '1.5rem',
      padding: token.spacing[4],
      fontSize: '14px',
      lineHeight: '1.6',
      fontFamily: "'JetBrains Mono', 'JetBrains Mono Fallback', monospace",
    },
    '& pre code': { background: 'transparent', padding: 0 },
    // Heading anchor links — fade in on hover of the heading.
    '& h2, & h3, & h4': {
      position: 'relative',
    },
    '& .heading-anchor': {
      opacity: 0,
      marginLeft: '0.5rem',
      color: token.color.gray[600],
      textDecoration: 'none',
      transition: 'opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
    '& h2:hover .heading-anchor, & h3:hover .heading-anchor, & h4:hover .heading-anchor': {
      opacity: 1,
    },
    '& .external-link-icon': {
      fontSize: '0.85em',
      color: token.color.gray[500],
    },
    '& .table-scroll': {
      overflowX: 'auto',
      marginBlock: '1.5rem',
      borderRadius: token.radius.md,
      border: '1px solid rgba(255,255,255,0.06)',
    },
    '& .table-scroll table': {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.95em',
    },
    '& .table-scroll th, & .table-scroll td': {
      textAlign: 'left',
      padding: '0.6rem 0.9rem',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    '& .table-scroll th': {
      fontWeight: '600',
      color: token.color.gray[200],
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    '& .table-scroll tr:nth-child(even) td': {
      backgroundColor: 'rgba(255,255,255,0.02)',
    },
  },
});
