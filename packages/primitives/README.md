# @vertz/primitives

Headless, WAI-ARIA compliant UI primitives for Vertz. Provides pre-built, accessible components with keyboard handling, focus management, and reactive state — you bring the styles.

## What it does

`@vertz/primitives` offers low-level UI components that handle:

- **Accessibility** — Proper ARIA roles, attributes, and live regions
- **Keyboard interaction** — Enter/Space for activation, Arrow keys for navigation, Escape for closing
- **Focus management** — Tab order, focus trapping, roving tabindex
- **State management** — Reactive state via `@vertz/ui` signals

These primitives are **intentionally imperative** — they return pre-wired DOM elements that you compose with your JSX. This gives you full control over styling and layout while ensuring accessibility best practices.

## Installation

```bash
npm install @vertz/primitives
```

This package depends on `@vertz/ui` for reactive state.

## Available Primitives

| Primitive | Description |
|-----------|-------------|
| **Accordion** | Collapsible sections with single or multiple expansion |
| **Button** | Accessible button with press state |
| **Checkbox** | Checkbox with indeterminate state support |
| **Combobox** | Searchable dropdown with filtering |
| **Dialog** | Modal dialog with focus trap and backdrop |
| **Menu** | Dropdown menu with arrow key navigation |
| **Popover** | Floating content anchored to a trigger |
| **Progress** | Progress bar with indeterminate mode |
| **Radio** | Radio button group with arrow key navigation |
| **Select** | Single-select dropdown |
| **Slider** | Range input with thumb and track |
| **Switch** | Toggle switch (on/off) |
| **Tabs** | Tabbed interface with keyboard navigation |
| **Toast** | Notification toast with auto-dismiss |
| **Tooltip** | Hover tooltip with pointer positioning |

## Usage

### Basic Pattern

All primitives follow this structure:

```typescript
import { Button } from '@vertz/primitives';

// Create the primitive
const { root, state } = Button.Root({
  disabled: false,
  onPress: () => console.log('Pressed!'),
});

// Customize the element
root.textContent = 'Click Me';
root.classList.add('my-button-class');

// Use in JSX or append to DOM
document.body.appendChild(root);
```

**Key concepts:**

- `Root()` returns an object with DOM elements and reactive state
- Elements have ARIA attributes and event handlers pre-configured
- `state` contains reactive signals you can read or modify
- You control styling, layout, and composition

### Button

```tsx
import { Button } from '@vertz/primitives';
import { css } from '@vertz/ui/css';

const styles = css({
  btn: ['px:4', 'py:2', 'bg:blue.600', 'text:white', 'rounded:md'],
  disabled: ['opacity:50', 'cursor:not-allowed'],
});

function MyButton() {
  const { root, state } = Button.Root({
    disabled: false,
    onPress: () => alert('Button pressed!'),
  });

  root.textContent = 'Submit';
  root.classList.add(styles.classNames.btn);

  // React to state changes
  effect(() => {
    if (state.disabled.value) {
      root.classList.add(styles.classNames.disabled);
    }
  });

  return root;
}
```

**Button API:**

```typescript
Button.Root(options: ButtonOptions): {
  root: HTMLButtonElement;
  state: {
    disabled: Signal<boolean>;
    pressed: Signal<boolean>;
  };
}
```

### Checkbox

```tsx
import { Checkbox } from '@vertz/primitives';

function TodoItem() {
  let isDone = false;

  const { root, state } = Checkbox.Root({
    checked: isDone,
    onCheckedChange: (checked) => {
      isDone = checked === true;
    },
  });

  const label = document.createElement('label');
  label.textContent = 'Complete task';
  label.prepend(root);

  return label;
}
```

**Checkbox API:**

```typescript
Checkbox.Root(options: CheckboxOptions): {
  root: HTMLInputElement;
  state: {
    checked: Signal<CheckedState>; // true | false | 'indeterminate'
    disabled: Signal<boolean>;
  };
}
```

### Dialog

```tsx
import { Dialog } from '@vertz/primitives';

function LoginDialog() {
  const { overlay, content, state } = Dialog.Root({
    open: false,
    onOpenChange: (open) => console.log(`Dialog ${open ? 'opened' : 'closed'}`),
  });

  content.innerHTML = `
    <h2>Log In</h2>
    <input type="email" placeholder="Email" />
    <input type="password" placeholder="Password" />
    <button>Submit</button>
  `;

  const trigger = document.createElement('button');
  trigger.textContent = 'Open Dialog';
  trigger.onclick = () => state.open.value = true;

  const container = document.createElement('div');
  container.appendChild(trigger);
  container.appendChild(overlay);

  return container;
}
```

**Dialog API:**

```typescript
Dialog.Root(options: DialogOptions): {
  overlay: HTMLDivElement;    // Backdrop element
  content: HTMLDivElement;     // Dialog content (focus trapped)
  state: {
    open: Signal<boolean>;
  };
}
```

The dialog handles:
- Focus trapping (Tab cycles through focusable elements)
- Escape key to close
- Click outside overlay to close
- Backdrop element with `aria-hidden` when open

### Menu

```tsx
import { Menu } from '@vertz/primitives';

function Dropdown() {
  const { trigger, content, state } = Menu.Root({
    open: false,
    onOpenChange: (open) => console.log(`Menu ${open ? 'opened' : 'closed'}`),
  });

  trigger.textContent = 'Actions';

  const item1 = Menu.Item({
    onSelect: () => console.log('Edit clicked'),
  });
  item1.textContent = 'Edit';

  const item2 = Menu.Item({
    onSelect: () => console.log('Delete clicked'),
  });
  item2.textContent = 'Delete';

  content.append(item1, item2);

  const container = document.createElement('div');
  container.append(trigger, content);
  return container;
}
```

**Menu API:**

```typescript
Menu.Root(options: MenuOptions): {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
  state: {
    open: Signal<boolean>;
  };
}

Menu.Item(options: { onSelect?: () => void }): HTMLDivElement
```

Menu handles:
- Arrow Up/Down navigation
- Enter/Space to select
- Escape to close
- Auto-focus first item on open

### Select

```tsx
import { Select } from '@vertz/primitives';

function LanguageSelect() {
  const { trigger, content, state } = Select.Root({
    value: 'en',
    onValueChange: (value) => console.log(`Selected: ${value}`),
  });

  const options = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
  ];

  for (const opt of options) {
    const option = Select.Option({ value: opt.value });
    option.textContent = opt.label;
    content.appendChild(option);
  }

  return <div>{trigger}{content}</div>;
}
```

**Select API:**

```typescript
Select.Root(options: SelectOptions): {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
  state: {
    value: Signal<string>;
    open: Signal<boolean>;
  };
}

Select.Option(options: { value: string }): HTMLDivElement
```

### Tabs

```tsx
import { Tabs } from '@vertz/primitives';

function Settings() {
  const { list, state } = Tabs.Root({
    defaultValue: 'general',
    onValueChange: (value) => console.log(`Tab: ${value}`),
  });

  const tab1 = Tabs.Trigger({ value: 'general' });
  tab1.textContent = 'General';

  const tab2 = Tabs.Trigger({ value: 'privacy' });
  tab2.textContent = 'Privacy';

  list.append(tab1, tab2);

  const panel1 = Tabs.Content({ value: 'general' });
  panel1.textContent = 'General settings...';

  const panel2 = Tabs.Content({ value: 'privacy' });
  panel2.textContent = 'Privacy settings...';

  return (
    <div>
      {list}
      {panel1}
      {panel2}
    </div>
  );
}
```

**Tabs API:**

```typescript
Tabs.Root(options: TabsOptions): {
  list: HTMLDivElement;
  state: {
    value: Signal<string>;
  };
}

Tabs.Trigger(options: { value: string }): HTMLButtonElement
Tabs.Content(options: { value: string }): HTMLDivElement
```

Tabs handle:
- Arrow Left/Right navigation
- Home/End keys to jump to first/last tab
- Automatic panel switching
- Proper `aria-selected` and `aria-controls` attributes

## Advanced: Custom Primitives

If you need to build your own headless components, use the utilities from `@vertz/primitives/utils`:

```typescript
import {
  uniqueId,
  setLabelledBy,
  setDescribedBy,
  getFocusableElements,
  trapFocus,
  handleListNavigation,
  Keys,
} from '@vertz/primitives/utils';

function CustomCombobox() {
  const inputId = uniqueId();
  const listboxId = uniqueId();

  const input = document.createElement('input');
  input.id = inputId;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', listboxId);

  const listbox = document.createElement('ul');
  listbox.id = listboxId;
  listbox.setAttribute('role', 'listbox');
  setLabelledBy(listbox, inputId);

  input.addEventListener('keydown', (e) => {
    if (Keys.isArrowDown(e)) {
      const focusable = getFocusableElements(listbox);
      focusable[0]?.focus();
    }
  });

  return { input, listbox };
}
```

### Available Utilities

**ARIA Helpers:**

- `setLabelledBy(el, id)` — Set `aria-labelledby`
- `setDescribedBy(el, id)` — Set `aria-describedby`
- `setControls(el, id)` — Set `aria-controls`
- `setExpanded(el, expanded)` — Set `aria-expanded`
- `setSelected(el, selected)` — Set `aria-selected`
- `setChecked(el, checked)` — Set `aria-checked`
- `setDisabled(el, disabled)` — Set `aria-disabled` and `disabled` attribute
- `setHidden(el, hidden)` — Set `aria-hidden`
- `setDataState(el, state)` — Set `data-state` attribute
- `setValueRange(el, value, min, max)` — Set `aria-valuenow/min/max`
- `toggleExpanded(el)` — Toggle `aria-expanded`

**Focus Management:**

- `getFocusableElements(container)` — Get all focusable elements in a container
- `focusFirst(container)` — Focus the first focusable element
- `saveFocus()` — Save the currently focused element (returns restore function)
- `trapFocus(container)` — Trap focus within a container (returns cleanup function)
- `setRovingTabindex(elements, activeIndex)` — Set roving tabindex pattern

**ID Generation:**

- `uniqueId(prefix?)` — Generate unique ID (e.g., `vertz-1`, `vertz-2`)
- `linkedIds(prefix, count)` — Generate multiple related IDs
- `resetIdCounter()` — Reset counter (useful for testing)

**Keyboard Handling:**

- `handleActivation(event, callback)` — Call callback on Enter/Space
- `handleListNavigation(event, items, currentIndex, onChange)` — Arrow key navigation
- `Keys` — Key name constants (`Keys.Enter`, `Keys.Escape`, `Keys.ArrowUp`, etc.)
- `isKey(event, key)` — Check if event matches key

## State Management

All primitives use `@vertz/ui` signals for state. You can read and modify state imperatively:

```typescript
const { state } = Dialog.Root({ open: false });

// Read
console.log(state.open.value); // false

// Write
state.open.value = true;

// React
effect(() => {
  console.log(`Dialog is ${state.open.value ? 'open' : 'closed'}`);
});
```

State properties are read-only at the type level but writable at runtime (for internal use). Prefer using the component's callbacks (`onOpenChange`, `onValueChange`, etc.) for external state changes.

## Styling

Primitives provide **zero styles**. You can style them with:

- **CSS classes** — `root.classList.add('my-button')`
- **Inline styles** — `root.style.padding = '8px'`
- **@vertz/ui/css** — `root.classList.add(css({ btn: [...] }).classNames.btn)`
- **Tailwind/UnoCSS** — `root.className = 'px-4 py-2 bg-blue-500'`

**Data attributes for styling:**

Most primitives set `data-state` attributes you can use for CSS:

```css
button[data-state="idle"] { /* ... */ }
button[data-state="pressed"] { /* ... */ }
button[data-state="disabled"] { /* ... */ }

[aria-expanded="true"] { /* ... */ }
[aria-checked="true"] { /* ... */ }
```

## Accessibility

All primitives follow WAI-ARIA authoring practices:

- **Buttons** — `role="button"`, Enter/Space activation
- **Checkboxes** — Native `<input type="checkbox">` with `aria-checked`
- **Dialogs** — Focus trap, Escape to close, `aria-modal`, `aria-labelledby`
- **Menus** — Arrow key navigation, `role="menu"`, `role="menuitem"`
- **Tabs** — Arrow navigation, `aria-selected`, `aria-controls`, `role="tab"` / `role="tabpanel"`
- **Sliders** — `aria-valuenow/min/max`, Arrow keys for adjustment
- **Comboboxes** — `aria-autocomplete`, `aria-expanded`, `aria-controls`

Keyboard navigation is always included where applicable.

## Type Definitions

Each primitive exports:

- **`[Component].Root(options)`** — Creates the primitive with options
- **`[Component]Options`** — Options interface
- **`[Component]State`** — Reactive state interface
- **`[Component]Elements`** — DOM element references

Example:

```typescript
import type { ButtonOptions, ButtonState, ButtonElements } from '@vertz/primitives';

const options: ButtonOptions = {
  disabled: false,
  onPress: () => {},
};

const button: ButtonElements & { state: ButtonState } = Button.Root(options);
```

## Performance

Primitives are **lightweight**:

- No virtual DOM
- No framework overhead
- Direct DOM manipulation
- Fine-grained reactivity via signals
- Event delegation where applicable

A typical primitive (e.g., `Button`) is ~2KB gzipped including reactivity.

## Relationship to @vertz/ui

`@vertz/primitives` builds on top of `@vertz/ui`:

- Uses `signal()` and `effect()` for reactive state
- Compatible with Vertz's JSX and compiler
- Can be composed with `@vertz/ui` components

However, primitives are **intentionally imperative** — they return DOM elements rather than JSX components. This gives you full control over composition and styling while maintaining accessibility.

## Related Packages

- **[@vertz/ui](../ui)** — The main UI framework (JSX, reactivity, compiler)
- **[@vertz/ui-compiler](../ui-compiler)** — Vite plugin for compiling Vertz components

## Inspiration

This package is inspired by:

- [Radix UI](https://www.radix-ui.com/) — Unstyled, accessible components
- [Headless UI](https://headlessui.com/) — Unstyled component behaviors
- [Ark UI](https://ark-ui.com/) — Framework-agnostic UI primitives

## License

MIT
