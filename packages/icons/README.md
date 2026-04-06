# @vertz/icons

Tree-shakeable Lucide icon components for Vertz — 1,900+ icons as lightweight functions.

## Features

- **1,900+ icons** — Full Lucide icon set, auto-generated and always up to date
- **Tree-shakeable** — Only the icons you import are bundled (ESM, `sideEffects: false`)
- **Zero runtime dependencies** — SVG strings are inlined at build time
- **Lightweight** — Each icon is a function that returns an `HTMLSpanElement`

## Installation

```bash
vtz add @vertz/icons
```

## Usage

```typescript
import { MoonIcon, SunIcon, ArrowLeftIcon } from '@vertz/icons';

// Call the icon function to get an HTMLSpanElement
const icon = MoonIcon({ size: 24, className: 'my-icon' });
```

In Vertz JSX components:

```tsx
import { MoonIcon, SunIcon } from '@vertz/icons';

function ThemeToggle({ isDark }: { isDark: boolean }) {
  return (
    <button>
      {isDark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </button>
  );
}
```

## API

All icons follow the same signature:

```typescript
function IconName(props?: IconProps): HTMLSpanElement

interface IconProps {
  size?: number;      // Width and height in pixels (default: 16)
  className?: string; // CSS class for the wrapper span
}
```

## Icon Naming

Icons use the Lucide naming convention with an `Icon` suffix:

| Lucide name | Import |
|---|---|
| `moon` | `MoonIcon` |
| `arrow-left` | `ArrowLeftIcon` |
| `chevron-down` | `ChevronDownIcon` |
| `circle-check` | `CircleCheckIcon` |

Browse all available icons at [lucide.dev/icons](https://lucide.dev/icons).

## License

MIT
