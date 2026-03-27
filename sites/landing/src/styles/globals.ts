import { globalCss } from '@vertz/ui';

export const appGlobals = globalCss({
  html: {
    scrollBehavior: 'smooth',
  },
  'html body': {
    backgroundColor: '#111110',
    fontFamily: 'var(--font-sans)',
    color: '#E8E4DC',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  },
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
  // Noise texture overlay
  'body::before': {
    content: "''",
    position: 'fixed',
    inset: '0',
    backgroundImage:
      'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44IiBudW1PY3RhdmVzPSI0IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsdGVyPSJ1cmwoI24pIiBvcGFjaXR5PSIxIi8+PC9zdmc+")',
    opacity: '0.02',
    pointerEvents: 'none',
    zIndex: '9999',
  },
});
