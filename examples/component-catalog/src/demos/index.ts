import { AccordionDemo } from './accordion';
import { AlertDemo } from './alert';
import { AlertDialogDemo } from './alert-dialog';
import { AvatarDemo } from './avatar';
import { BadgeDemo } from './badge';
import { ButtonDemo } from './button';
import { CardDemo } from './card';
import { CheckboxDemo } from './checkbox';
import { DialogDemo } from './dialog';
import { DropdownMenuDemo } from './dropdown-menu';
import { FormGroupDemo } from './form-group';
import { InputDemo } from './input';
import { LabelDemo } from './label';
import { PopoverDemo } from './popover';
import { ProgressDemo } from './progress';
import { RadioGroupDemo } from './radio-group';
import { SelectDemo } from './select';
import { SeparatorDemo } from './separator';
import { SheetDemo } from './sheet';
import { SkeletonDemo } from './skeleton';
import { SliderDemo } from './slider';
import { SwitchDemo } from './switch';
import { TableDemo } from './table';
import { TabsDemo } from './tabs';
import { TextareaDemo } from './textarea';
import { ToastDemo } from './toast';
import { TooltipDemo } from './tooltip';

export interface ComponentEntry {
  name: string;
  slug: string;
  category: 'form' | 'layout' | 'data-display' | 'overlay' | 'navigation' | 'feedback';
  description: string;
  demo: () => Element;
}

export const componentRegistry: ComponentEntry[] = [
  // ── Form ──────────────────────────────────────────────────
  {
    name: 'Button',
    slug: 'button',
    category: 'form',
    description: 'Triggers an action or event.',
    demo: ButtonDemo,
  },
  {
    name: 'Input',
    slug: 'input',
    category: 'form',
    description: 'Text input field for forms.',
    demo: InputDemo,
  },
  {
    name: 'Textarea',
    slug: 'textarea',
    category: 'form',
    description: 'Multi-line text input.',
    demo: TextareaDemo,
  },
  {
    name: 'Label',
    slug: 'label',
    category: 'form',
    description: 'Accessible label for form controls.',
    demo: LabelDemo,
  },
  {
    name: 'FormGroup',
    slug: 'form-group',
    category: 'form',
    description: 'Groups form controls with error display.',
    demo: FormGroupDemo,
  },
  {
    name: 'Checkbox',
    slug: 'checkbox',
    category: 'form',
    description: 'Toggle control for boolean values.',
    demo: CheckboxDemo,
  },
  {
    name: 'Switch',
    slug: 'switch',
    category: 'form',
    description: 'Toggle between on and off states.',
    demo: SwitchDemo,
  },
  {
    name: 'RadioGroup',
    slug: 'radio-group',
    category: 'form',
    description: 'Select one option from a set.',
    demo: RadioGroupDemo,
  },
  {
    name: 'Select',
    slug: 'select',
    category: 'form',
    description: 'Dropdown selection control.',
    demo: SelectDemo,
  },
  {
    name: 'Slider',
    slug: 'slider',
    category: 'form',
    description: 'Range input with track and thumb.',
    demo: SliderDemo,
  },

  // ── Layout ────────────────────────────────────────────────
  {
    name: 'Card',
    slug: 'card',
    category: 'layout',
    description: 'Container with header, content, and footer.',
    demo: CardDemo,
  },
  {
    name: 'Separator',
    slug: 'separator',
    category: 'layout',
    description: 'Visual divider between content.',
    demo: SeparatorDemo,
  },
  {
    name: 'Accordion',
    slug: 'accordion',
    category: 'layout',
    description: 'Expandable/collapsible content sections.',
    demo: AccordionDemo,
  },
  {
    name: 'Tabs',
    slug: 'tabs',
    category: 'layout',
    description: 'Tabbed content organization.',
    demo: TabsDemo,
  },

  // ── Data Display ──────────────────────────────────────────
  {
    name: 'Badge',
    slug: 'badge',
    category: 'data-display',
    description: 'Small status or count indicator.',
    demo: BadgeDemo,
  },
  {
    name: 'Avatar',
    slug: 'avatar',
    category: 'data-display',
    description: 'User profile image with fallback.',
    demo: AvatarDemo,
  },
  {
    name: 'Table',
    slug: 'table',
    category: 'data-display',
    description: 'Tabular data display.',
    demo: TableDemo,
  },
  {
    name: 'Skeleton',
    slug: 'skeleton',
    category: 'data-display',
    description: 'Loading placeholder with pulse animation.',
    demo: SkeletonDemo,
  },
  {
    name: 'Progress',
    slug: 'progress',
    category: 'data-display',
    description: 'Shows task completion percentage.',
    demo: ProgressDemo,
  },

  // ── Overlay ───────────────────────────────────────────────
  {
    name: 'Dialog',
    slug: 'dialog',
    category: 'overlay',
    description: 'Modal dialog with backdrop.',
    demo: DialogDemo,
  },
  {
    name: 'AlertDialog',
    slug: 'alert-dialog',
    category: 'overlay',
    description: 'Confirmation dialog requiring action.',
    demo: AlertDialogDemo,
  },
  {
    name: 'Sheet',
    slug: 'sheet',
    category: 'overlay',
    description: 'Side panel that slides in from edge.',
    demo: SheetDemo,
  },
  {
    name: 'Popover',
    slug: 'popover',
    category: 'overlay',
    description: 'Floating content anchored to trigger.',
    demo: PopoverDemo,
  },
  {
    name: 'Tooltip',
    slug: 'tooltip',
    category: 'overlay',
    description: 'Brief info on hover or focus.',
    demo: TooltipDemo,
  },

  // ── Navigation ────────────────────────────────────────────
  {
    name: 'DropdownMenu',
    slug: 'dropdown-menu',
    category: 'navigation',
    description: 'Menu triggered by a button click.',
    demo: DropdownMenuDemo,
  },

  // ── Feedback ──────────────────────────────────────────────
  {
    name: 'Alert',
    slug: 'alert',
    category: 'feedback',
    description: 'Inline alert messages.',
    demo: AlertDemo,
  },
  {
    name: 'Toast',
    slug: 'toast',
    category: 'feedback',
    description: 'Temporary notification popup.',
    demo: ToastDemo,
  },
];

/** Group entries by category. */
export function groupByCategory(entries: ComponentEntry[]): Map<string, ComponentEntry[]> {
  const groups = new Map<string, ComponentEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.category) ?? [];
    list.push(entry);
    groups.set(entry.category, list);
  }
  return groups;
}

/** Category display labels. */
export const categoryLabels: Record<string, string> = {
  form: 'Form',
  layout: 'Layout',
  'data-display': 'Data Display',
  overlay: 'Overlay',
  navigation: 'Navigation',
  feedback: 'Feedback',
};

/** Category order. */
export const categoryOrder = ['form', 'layout', 'data-display', 'overlay', 'navigation', 'feedback'];
