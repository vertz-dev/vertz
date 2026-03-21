---
'@vertz/theme-shadcn': patch
---

fix(theme-shadcn): add explicit text:foreground to components with bg:background

Components that set `bg:background` without a corresponding `text:foreground` could show black text on dark backgrounds when rendered in the browser's top-layer (e.g., Dialog/AlertDialog via `showModal()`). Fixed by adding explicit `text:foreground` to all affected components: Dialog, AlertDialog, Calendar, Carousel, Menubar, DatePicker, Pagination, and Button outline variant.
