export type {
  ResolvedTheme,
  ResolvedThemeBase,
  ThemeComponents,
  ThemeConfig,
  ThemedPrimitives,
  ThemeStyle,
  ThemeStyles,
} from './configure';
export { configureTheme } from './configure';

// ---------------------------------------------------------------------------
// Module augmentation for @vertz/ui/components
//
// When @vertz/theme-shadcn is installed, this augments ThemeComponentMap in
// @vertz/ui/components with all component types, providing full type safety
// for centralized imports:
//
//   import { Button, Dialog } from '@vertz/ui/components';
//
// ---------------------------------------------------------------------------

import type { AlertComponents } from './components/alert';
import type { AvatarComponents } from './components/avatar';
import type { BadgeProps } from './components/badge';
import type { BreadcrumbComponents } from './components/breadcrumb';
import type { ButtonProps } from './components/button';
import type { CardComponents } from './components/card';
import type { FormGroupComponents } from './components/form-group';
import type { InputProps } from './components/input';
import type { LabelProps } from './components/label';
import type { PaginationComponents } from './components/pagination';
import type { ThemedAccordionComponent } from './components/primitives/accordion';
import type { ThemedAlertDialogComponent } from './components/primitives/alert-dialog';
import type { ThemedCheckboxComponent } from './components/primitives/checkbox';
import type { ThemedDialogComponent } from './components/primitives/dialog';
import type { ThemedDropdownMenuComponent } from './components/primitives/dropdown-menu';
import type { ThemedPopoverComponent } from './components/primitives/popover';
import type { ThemedProgressComponent } from './components/primitives/progress';
import type { ThemedRadioGroupComponent } from './components/primitives/radio-group';
import type { ThemedSelectComponent } from './components/primitives/select';
import type { ThemedSheetComponent } from './components/primitives/sheet';
import type { ThemedSliderComponent } from './components/primitives/slider';
import type { ThemedSwitchComponent } from './components/primitives/switch';
import type { ThemedTabsComponent } from './components/primitives/tabs';
import type { ThemedToggleComponent } from './components/primitives/toggle';
import type { ThemedTooltipComponent } from './components/primitives/tooltip';
import type { SeparatorProps } from './components/separator';
import type { SkeletonComponents } from './components/skeleton';
import type { TableComponents } from './components/table';
import type { TextareaProps } from './components/textarea';
import type { ThemedPrimitives } from './configure';

declare module '@vertz/ui/components' {
  interface ThemeComponentMap {
    // Direct components
    Button: (props: ButtonProps) => HTMLButtonElement;
    Badge: (props: BadgeProps) => HTMLSpanElement;
    Input: (props: InputProps) => HTMLInputElement;
    Textarea: (props: TextareaProps) => HTMLTextAreaElement;
    Label: (props: LabelProps) => HTMLLabelElement;
    Separator: (props: SeparatorProps) => HTMLHRElement;
    Breadcrumb: BreadcrumbComponents;
    Pagination: PaginationComponents;

    // Suite components
    Alert: AlertComponents;
    Card: CardComponents;
    FormGroup: FormGroupComponents;
    Avatar: AvatarComponents;
    Skeleton: SkeletonComponents;
    Table: TableComponents;

    // Compound primitives (callable + sub-components)
    AlertDialog: ThemedAlertDialogComponent;
    Dialog: ThemedDialogComponent;
    DropdownMenu: ThemedDropdownMenuComponent;
    Select: ThemedSelectComponent;
    Tabs: ThemedTabsComponent;
    Popover: ThemedPopoverComponent;
    RadioGroup: ThemedRadioGroupComponent;
    Accordion: ThemedAccordionComponent;
    Tooltip: ThemedTooltipComponent;
    Sheet: ThemedSheetComponent;

    // Simple primitives (callable only)
    Checkbox: ThemedCheckboxComponent;
    Switch: ThemedSwitchComponent;
    Progress: ThemedProgressComponent;
    Slider: ThemedSliderComponent;
    Toggle: ThemedToggleComponent;
    Toast: ThemedPrimitives['Toast'];

    // Factory primitives (lowercase)
    calendar: ThemedPrimitives['calendar'];
    carousel: ThemedPrimitives['carousel'];
    collapsible: ThemedPrimitives['collapsible'];
    command: ThemedPrimitives['command'];
    contextMenu: ThemedPrimitives['contextMenu'];
    datePicker: ThemedPrimitives['datePicker'];
    drawer: ThemedPrimitives['drawer'];
    hoverCard: ThemedPrimitives['hoverCard'];
    menubar: ThemedPrimitives['menubar'];
    navigationMenu: ThemedPrimitives['navigationMenu'];
    resizablePanel: ThemedPrimitives['resizablePanel'];
    scrollArea: ThemedPrimitives['scrollArea'];
    toggleGroup: ThemedPrimitives['toggleGroup'];
  }
}
