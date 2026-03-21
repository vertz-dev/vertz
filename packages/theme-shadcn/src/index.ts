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

// Ensure @vertz/ui/components is loaded for module augmentation below
import type {} from '@vertz/ui/components';

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

import type {
  ComposedAvatar,
  ComposedBreadcrumbProps,
  ComposedCard,
  ComposedFormGroup,
  ComposedInputProps,
  ComposedLabelProps,
  ComposedPaginationProps,
  ComposedSeparatorProps,
  ComposedSkeletonProps,
  ComposedTable,
  ComposedTextareaProps,
  StyledPrimitive,
} from '@vertz/ui-primitives';
import type { ThemedAccordionComponent } from './components/primitives/accordion';
import type { ThemedAlertDialogComponent } from './components/primitives/alert-dialog';
import type { ThemedCalendarComponent } from './components/primitives/calendar';
import type { ThemedCarouselComponent } from './components/primitives/carousel';
import type { ThemedCheckboxComponent } from './components/primitives/checkbox';
import type { ThemedCollapsibleComponent } from './components/primitives/collapsible';
import type { ThemedCommandComponent } from './components/primitives/command';
import type { ThemedContextMenuComponent } from './components/primitives/context-menu';
import type { ThemedDatePickerComponent } from './components/primitives/date-picker';
import type { ThemedDialogComponent } from './components/primitives/dialog';
import type { ThemedDrawerComponent } from './components/primitives/drawer';
import type { ThemedDropdownMenuComponent } from './components/primitives/dropdown-menu';
import type { ThemedHoverCardComponent } from './components/primitives/hover-card';
import type { ThemedMenubarComponent } from './components/primitives/menubar';
import type { ThemedNavigationMenuComponent } from './components/primitives/navigation-menu';
import type { ThemedPopoverComponent } from './components/primitives/popover';
import type { ThemedProgressComponent } from './components/primitives/progress';
import type { ThemedRadioGroupComponent } from './components/primitives/radio-group';
import type { ThemedResizablePanelComponent } from './components/primitives/resizable-panel';
import type { ThemedSelectComponent } from './components/primitives/select';
import type { ThemedSheetComponent } from './components/primitives/sheet';
import type { ThemedSliderComponent } from './components/primitives/slider';
import type { ThemedSwitchComponent } from './components/primitives/switch';
import type { ThemedTabsComponent } from './components/primitives/tabs';
import type { ThemedToggleComponent } from './components/primitives/toggle';
import type { ThemedToggleGroupComponent } from './components/primitives/toggle-group';
import type { ThemedTooltipComponent } from './components/primitives/tooltip';
import type {
  ThemeComponents,
  ThemedBadgeProps,
  ThemedButtonProps,
  ThemedPrimitives,
} from './configure';

declare module '@vertz/ui/components' {
  interface ThemeComponentMap {
    // Direct components
    Button: (props: ThemedButtonProps) => HTMLElement;
    Badge: (props: ThemedBadgeProps) => HTMLElement;
    Input: (props: Omit<ComposedInputProps, 'classes'>) => HTMLElement;
    Textarea: (props: Omit<ComposedTextareaProps, 'classes'>) => HTMLElement;
    Label: (props: Omit<ComposedLabelProps, 'classes'>) => HTMLElement;
    Separator: (props: Omit<ComposedSeparatorProps, 'classes'>) => HTMLElement;
    Breadcrumb: (props: Omit<ComposedBreadcrumbProps, 'classes'>) => HTMLElement;
    Pagination: (props: Omit<ComposedPaginationProps, 'classes'>) => HTMLElement;

    // Compound composed components
    Alert: ThemeComponents['Alert'];
    Card: StyledPrimitive<typeof ComposedCard>;
    FormGroup: StyledPrimitive<typeof ComposedFormGroup>;
    Avatar: StyledPrimitive<typeof ComposedAvatar>;
    Skeleton: (props: Omit<ComposedSkeletonProps, 'classes'>) => HTMLElement;
    Table: StyledPrimitive<typeof ComposedTable>;

    // Compound primitives (callable + sub-components)
    AlertDialog: ThemedAlertDialogComponent;
    Dialog: ThemedDialogComponent;
    DropdownMenu: ThemedDropdownMenuComponent;
    Select: ThemedSelectComponent;
    Tabs: ThemedTabsComponent;
    Popover: ThemedPopoverComponent;
    RadioGroup: ThemedRadioGroupComponent;
    Accordion: ThemedAccordionComponent;
    ContextMenu: ThemedContextMenuComponent;
    Tooltip: ThemedTooltipComponent;
    Sheet: ThemedSheetComponent;
    Drawer: ThemedDrawerComponent;
    Menubar: ThemedMenubarComponent;

    // Simple primitives (callable only)
    Calendar: ThemedCalendarComponent;
    Checkbox: ThemedCheckboxComponent;
    Switch: ThemedSwitchComponent;
    Progress: ThemedProgressComponent;
    Slider: ThemedSliderComponent;
    Toggle: ThemedToggleComponent;
    Toast: ThemedPrimitives['Toast'];

    // Compound primitives (callable + sub-components) — continued
    Carousel: ThemedCarouselComponent;

    // Compound primitives (callable + sub-components) — continued
    Command: ThemedCommandComponent;

    // Compound primitives — continued
    Collapsible: ThemedCollapsibleComponent;
    DatePicker: ThemedDatePickerComponent;
    HoverCard: ThemedHoverCardComponent;
    NavigationMenu: ThemedNavigationMenuComponent;
    ResizablePanel: ThemedResizablePanelComponent;
    ScrollArea: ThemedPrimitives['ScrollArea'];
    ToggleGroup: ThemedToggleGroupComponent;
  }
}
