import { injectCSS } from '@vertz/ui';
import type { VariantFunction } from '@vertz/ui';
import type {
  ComposedAlertProps,
  ComposedBadgeProps,
  ComposedButtonProps,
  ComposedInputProps,
  ComposedLabelProps,
  ComposedPaginationProps,
  ComposedSeparatorProps,
  ComposedSkeletonCircleProps,
  ComposedSkeletonProps,
  ComposedSkeletonTextProps,
  ComposedTextareaProps,
  StyledPrimitive,
  ToastOptions,
} from '@vertz/ui-primitives';
import {
  ComposedAlert,
  ComposedAvatar,
  ComposedBadge,
  ComposedBreadcrumb,
  ComposedButton,
  ComposedCard,
  ComposedEmptyState,
  ComposedFormGroup,
  ComposedInput,
  ComposedLabel,
  ComposedPagination,
  ComposedSeparator,
  ComposedSkeleton,
  ComposedTable,
  ComposedTextarea,
  withStyles,
} from '@vertz/ui-primitives';
import type { ThemedAccordionComponent } from './components/primitives/accordion';
import { createThemedAccordion } from './components/primitives/accordion';
import type { ThemedCalendarComponent } from './components/primitives/calendar';
import { createThemedCalendar } from './components/primitives/calendar';
import type { ThemedCarouselComponent } from './components/primitives/carousel';
import { createThemedCarousel } from './components/primitives/carousel';
import type { ThemedCheckboxComponent } from './components/primitives/checkbox';
import { createThemedCheckbox } from './components/primitives/checkbox';
import type { ThemedCollapsibleComponent } from './components/primitives/collapsible';
import { createThemedCollapsible } from './components/primitives/collapsible';
import type { ThemedCommandComponent } from './components/primitives/command';
import { createThemedCommand } from './components/primitives/command';
import type { ThemedContextMenuComponent } from './components/primitives/context-menu';
import { createThemedContextMenu } from './components/primitives/context-menu';
import type { ThemedDatePickerComponent } from './components/primitives/date-picker';
import { createThemedDatePicker } from './components/primitives/date-picker';
import type { ThemedDialogComponent } from './components/primitives/dialog';
import { createThemedDialog } from './components/primitives/dialog';
import type { ThemedDrawerComponent } from './components/primitives/drawer';
import { createThemedDrawer } from './components/primitives/drawer';
import type { ThemedDropdownMenuComponent } from './components/primitives/dropdown-menu';
import { createThemedDropdownMenu } from './components/primitives/dropdown-menu';
import type { ThemedHoverCardComponent } from './components/primitives/hover-card';
import { createThemedHoverCard } from './components/primitives/hover-card';
import type { ThemedListComponent } from './components/primitives/list';
import { createThemedList } from './components/primitives/list';
import type { ThemedMenubarComponent } from './components/primitives/menubar';
import { createThemedMenubar } from './components/primitives/menubar';
import type { ThemedNavigationMenuComponent } from './components/primitives/navigation-menu';
import { createThemedNavigationMenu } from './components/primitives/navigation-menu';
import type { ThemedPopoverComponent } from './components/primitives/popover';
import { createThemedPopover } from './components/primitives/popover';
import type { ThemedProgressComponent } from './components/primitives/progress';
import { createThemedProgress } from './components/primitives/progress';
import type { ThemedRadioGroupComponent } from './components/primitives/radio-group';
import { createThemedRadioGroup } from './components/primitives/radio-group';
import { createThemedResizablePanel } from './components/primitives/resizable-panel';
import type { ThemedScrollAreaComponent } from './components/primitives/scroll-area';
import { createThemedScrollArea } from './components/primitives/scroll-area';
import type { ThemedSelectComponent } from './components/primitives/select';
import { createThemedSelect } from './components/primitives/select';
import type { ThemedSheetComponent } from './components/primitives/sheet';
import { createThemedSheet } from './components/primitives/sheet';
import type { ThemedSliderComponent } from './components/primitives/slider';
import { createThemedSlider } from './components/primitives/slider';
import type { ThemedSwitchComponent } from './components/primitives/switch';
import { createThemedSwitch } from './components/primitives/switch';
import type { ThemedTabsComponent } from './components/primitives/tabs';
import { createThemedTabs } from './components/primitives/tabs';
import type { ThemedToastResult } from './components/primitives/toast';
import { createThemedToast } from './components/primitives/toast';
import type { ThemedToggleComponent } from './components/primitives/toggle';
import { createThemedToggle } from './components/primitives/toggle';
import type { ThemedToggleGroupComponent } from './components/primitives/toggle-group';
import { createThemedToggleGroup } from './components/primitives/toggle-group';
import type { ThemedTooltipComponent } from './components/primitives/tooltip';
import { createThemedTooltip } from './components/primitives/tooltip';
import {
  createAccordionStyles,
  createAlertStyles,
  createAvatarStyles,
  createBadge,
  createBreadcrumbStyles,
  createButton,
  createCalendarStyles,
  createCard,
  createCarouselStyles,
  createCheckboxStyles,
  createCollapsibleStyles,
  createCommandStyles,
  createContextMenuStyles,
  createDatePickerStyles,
  createDialogGlobalStyles,
  createDialogStyles,
  createDrawerStyles,
  createDropdownMenuStyles,
  createEmptyStateStyles,
  createFormGroup,
  createHoverCardStyles,
  createInput,
  createLabel,
  createListStyles,
  createMenubarStyles,
  createNavigationMenuStyles,
  createPaginationStyles,
  createPopoverStyles,
  createProgressStyles,
  createRadioGroupStyles,
  createResizablePanelStyles,
  createScrollAreaStyles,
  createSelectStyles,
  createSeparator,
  createSheetStyles,
  createSkeletonStyles,
  createSliderStyles,
  createSwitchStyles,
  createTableStyles,
  createTabsStyles,
  createTextarea,
  createToastStyles,
  createToggleGroupStyles,
  createToggleStyles,
  createTooltipStyles,
} from './styles';

export type { ResolvedThemeBase, ThemeConfig, ThemeStyle } from './base';

import type { ResolvedThemeBase, ThemeConfig } from './base';
import { configureThemeBase } from './base';

/** Pre-built style definitions returned by configureTheme(). */
export interface ThemeStyles {
  /** Button variant function: `button({ intent: 'primary', size: 'md' })` */
  button: VariantFunction<{
    intent: Record<string, string[]>;
    size: Record<string, string[]>;
  }>;
  /** Alert css() result with root, destructive, title, description. */
  alert: {
    readonly root: string;
    readonly destructive: string;
    readonly title: string;
    readonly description: string;
    readonly css: string;
  };
  /** Badge variant function: `badge({ color: 'blue' })` */
  badge: VariantFunction<{
    color: Record<string, string[]>;
  }>;
  /** Card css() result with root, header, title, description, content, footer. */
  card: {
    readonly root: string;
    readonly header: string;
    readonly title: string;
    readonly description: string;
    readonly content: string;
    readonly footer: string;
    readonly action: string;
    readonly css: string;
  };
  /** Input css() result. */
  input: { readonly base: string; readonly css: string };
  /** Textarea css() result. */
  textarea: { readonly base: string; readonly css: string };
  /** Label css() result. */
  label: { readonly base: string; readonly css: string };
  /** Separator css() result. */
  separator: { readonly base: string; readonly css: string };
  /** Form group css() result with base and error. */
  formGroup: { readonly base: string; readonly error: string; readonly css: string };
  /** Dialog css() styles. */
  dialog: {
    readonly overlay: string;
    readonly panel: string;
    readonly title: string;
    readonly description: string;
    readonly close: string;
    readonly footer: string;
    readonly css: string;
  };
  /** DropdownMenu css() styles. */
  dropdownMenu: {
    readonly content: string;
    readonly item: string;
    readonly group: string;
    readonly label: string;
    readonly separator: string;
    readonly css: string;
  };
  /** Select css() styles. */
  select: {
    readonly trigger: string;
    readonly content: string;
    readonly item: string;
    readonly group: string;
    readonly label: string;
    readonly separator: string;
    readonly scrollButton: string;
    readonly css: string;
  };
  /** Tabs css() styles. */
  tabs: {
    readonly list: string;
    readonly trigger: string;
    readonly panel: string;
    readonly listLine: string;
    readonly triggerLine: string;
    readonly css: string;
  };
  /** Checkbox css() styles. */
  checkbox: {
    readonly root: string;
    readonly indicator: string;
    readonly css: string;
  };
  /** Switch css() styles. */
  switch: {
    readonly root: string;
    readonly thumb: string;
    readonly rootSm: string;
    readonly thumbSm: string;
    readonly css: string;
  };
  /** Popover css() styles. */
  popover: {
    readonly content: string;
    readonly css: string;
  };
  /** Progress css() styles. */
  progress: {
    readonly root: string;
    readonly indicator: string;
    readonly css: string;
  };
  /** RadioGroup css() styles. */
  radioGroup: {
    readonly root: string;
    readonly item: string;
    readonly indicator: string;
    readonly indicatorIcon: string;
    readonly css: string;
  };
  /** Slider css() styles. */
  slider: {
    readonly root: string;
    readonly track: string;
    readonly range: string;
    readonly thumb: string;
    readonly css: string;
  };
  /** Accordion css() styles. */
  accordion: {
    readonly item: string;
    readonly trigger: string;
    readonly content: string;
    readonly css: string;
  };
  /** Toast css() styles. */
  toast: {
    readonly viewport: string;
    readonly root: string;
    readonly title: string;
    readonly description: string;
    readonly action: string;
    readonly close: string;
    readonly css: string;
  };
  /** Tooltip css() styles. */
  tooltip: {
    readonly content: string;
    readonly css: string;
  };
  /** Avatar css() styles. */
  avatar: {
    readonly root: string;
    readonly image: string;
    readonly fallback: string;
    readonly rootSm: string;
    readonly rootLg: string;
    readonly rootXl: string;
    readonly fallbackSm: string;
    readonly fallbackLg: string;
    readonly fallbackXl: string;
    readonly css: string;
  };
  /** EmptyState css() styles. */
  emptyState: {
    readonly root: string;
    readonly icon: string;
    readonly title: string;
    readonly description: string;
    readonly action: string;
    readonly css: string;
  };
  /** Skeleton css() styles. */
  skeleton: {
    readonly root: string;
    readonly textRoot: string;
    readonly textLine: string;
    readonly circleRoot: string;
    readonly css: string;
  };
  /** Table css() styles. */
  table: {
    readonly root: string;
    readonly header: string;
    readonly body: string;
    readonly row: string;
    readonly head: string;
    readonly cell: string;
    readonly caption: string;
    readonly footer: string;
    readonly css: string;
  };
  /** Sheet css() styles. */
  sheet: {
    readonly overlay: string;
    readonly panelLeft: string;
    readonly panelRight: string;
    readonly panelTop: string;
    readonly panelBottom: string;
    readonly title: string;
    readonly description: string;
    readonly close: string;
    readonly css: string;
  };
  /** Breadcrumb css() styles. */
  breadcrumb: ReturnType<typeof createBreadcrumbStyles>;
  /** Calendar css() styles. */
  calendar: ReturnType<typeof createCalendarStyles>;
  /** Carousel css() styles. */
  carousel: ReturnType<typeof createCarouselStyles>;
  /** Collapsible css() styles. */
  collapsible: ReturnType<typeof createCollapsibleStyles>;
  /** Command css() styles. */
  command: ReturnType<typeof createCommandStyles>;
  /** ContextMenu css() styles. */
  contextMenu: ReturnType<typeof createContextMenuStyles>;
  /** DatePicker css() styles. */
  datePicker: ReturnType<typeof createDatePickerStyles>;
  /** Drawer css() styles. */
  drawer: ReturnType<typeof createDrawerStyles>;
  /** HoverCard css() styles. */
  hoverCard: ReturnType<typeof createHoverCardStyles>;
  /** List css() styles. */
  list: ReturnType<typeof createListStyles>;
  /** Menubar css() styles. */
  menubar: ReturnType<typeof createMenubarStyles>;
  /** NavigationMenu css() styles. */
  navigationMenu: ReturnType<typeof createNavigationMenuStyles>;
  /** Pagination css() styles. */
  pagination: ReturnType<typeof createPaginationStyles>;
  /** ResizablePanel css() styles. */
  resizablePanel: ReturnType<typeof createResizablePanelStyles>;
  /** ScrollArea css() styles. */
  scrollArea: ReturnType<typeof createScrollAreaStyles>;
  /** Toggle css() styles. */
  toggle: ReturnType<typeof createToggleStyles>;
  /** ToggleGroup css() styles. */
  toggleGroup: ReturnType<typeof createToggleGroupStyles>;
}

/** Themed primitive factories returned by configureTheme(). */
export interface ThemedPrimitives {
  /** Themed Dialog — stack-aware sub-components: Dialog.Header, Dialog.Title, Dialog.Description, Dialog.Footer, Dialog.Body, Dialog.Close, Dialog.Cancel. */
  Dialog: ThemedDialogComponent;
  /** Themed DropdownMenu — composable JSX component with DropdownMenu.Trigger, DropdownMenu.Content, etc. */
  DropdownMenu: ThemedDropdownMenuComponent;
  /** Themed Select — composable JSX component with Select.Content, Select.Item, etc. */
  Select: ThemedSelectComponent;
  /** Themed Tabs — composable JSX component with Tabs.List, Tabs.Trigger, Tabs.Content. */
  Tabs: ThemedTabsComponent;
  /** Themed Checkbox — composable JSX component wrapping @vertz/ui-primitives Checkbox. */
  Checkbox: ThemedCheckboxComponent;
  /** Themed Switch — composable JSX component wrapping @vertz/ui-primitives Switch. */
  Switch: ThemedSwitchComponent;
  /** Themed Popover — composable JSX component with Popover.Trigger, Popover.Content. */
  Popover: ThemedPopoverComponent;
  /** Themed Progress — composable JSX component wrapping @vertz/ui-primitives Progress. */
  Progress: ThemedProgressComponent;
  /** Themed RadioGroup — composable JSX component with RadioGroup.Item sub-components. */
  RadioGroup: ThemedRadioGroupComponent;
  /** Themed Slider — composable JSX component wrapping @vertz/ui-primitives Slider. */
  Slider: ThemedSliderComponent;
  /** Themed Accordion — composable JSX component with Accordion.Item, Accordion.Trigger, Accordion.Content. */
  Accordion: ThemedAccordionComponent;
  /** Themed Toast — factory wrapping @vertz/ui-primitives Toast with shadcn styles. */
  Toast: (options?: ToastOptions) => ThemedToastResult;
  /** Themed Tooltip — composable JSX component with Tooltip.Trigger, Tooltip.Content. */
  Tooltip: ThemedTooltipComponent;
  /** Themed Sheet — composable JSX component with Sheet.Trigger, Sheet.Content, etc. */
  Sheet: ThemedSheetComponent;
  /** Themed Calendar — composable JSX component wrapping @vertz/ui-primitives Calendar. */
  Calendar: ThemedCalendarComponent;
  /** Themed Carousel — composable JSX component with Carousel.Slide, Carousel.Previous, Carousel.Next. */
  Carousel: ThemedCarouselComponent;
  /** Themed Collapsible — expandable/collapsible content section. */
  Collapsible: ThemedCollapsibleComponent;
  /** Themed Command — composable JSX component with Command.Input, Command.List, Command.Item, Command.Group, etc. */
  Command: ThemedCommandComponent;
  /** Themed ContextMenu — composable JSX component with ContextMenu.Trigger, ContextMenu.Content, etc. */
  ContextMenu: ThemedContextMenuComponent;
  /** Themed DatePicker — composable JSX component with DatePicker.Trigger, DatePicker.Content. */
  DatePicker: ThemedDatePickerComponent;
  /** Themed Drawer — composable JSX component with Drawer.Trigger, Drawer.Content, Drawer.Handle, etc. */
  Drawer: ThemedDrawerComponent;
  /** Themed HoverCard — hover-triggered interactive card. */
  HoverCard: ThemedHoverCardComponent;
  /** Themed List — compound component with List.Item and List.DragHandle. */
  List: ThemedListComponent;
  /** Themed Menubar — composable JSX component with Menubar.Menu, Menubar.Trigger, Menubar.Content, etc. */
  Menubar: ThemedMenubarComponent;
  /** Themed NavigationMenu — composable JSX component with NavigationMenu.List, NavigationMenu.Item, etc. */
  NavigationMenu: ThemedNavigationMenuComponent;
  /** Themed ResizablePanel — resizable panel layout with drag handles. */
  ResizablePanel: ReturnType<typeof createThemedResizablePanel>;
  /** Themed ScrollArea — composable JSX component wrapping @vertz/ui-primitives ScrollArea. */
  ScrollArea: ThemedScrollAreaComponent;
  /** Themed Toggle — composable JSX component wrapping @vertz/ui-primitives Toggle. */
  Toggle: ThemedToggleComponent;
  /** Themed ToggleGroup — composable JSX component with ToggleGroup.Item sub-components. */
  ToggleGroup: ThemedToggleGroupComponent;
}

/** Props for the themed Button component (extends composed primitive props with variant support). */
export interface ThemedButtonProps extends Omit<ComposedButtonProps, 'classes'> {
  intent?: string;
  size?: string;
}

/** Props for the themed Badge component (extends composed primitive props with color variant). */
export interface ThemedBadgeProps extends Omit<ComposedBadgeProps, 'classes'> {
  color?: string;
}

/** Props for the themed Alert component (extends composed primitive props with variant support). */
export interface ThemedAlertProps extends Omit<ComposedAlertProps, 'classes'> {
  variant?: 'default' | 'destructive';
}

/** Component functions returned by configureTheme(). */
export interface ThemeComponents {
  /** Alert component with variant support and sub-components (Alert.Title, Alert.Description). */
  Alert: ((props: ThemedAlertProps) => HTMLElement) & {
    Title: typeof ComposedAlert.Title;
    Description: typeof ComposedAlert.Description;
  };
  /** Button component with intent/size variants. */
  Button: (props: ThemedButtonProps) => HTMLElement;
  /** Badge component with color variants. */
  Badge: (props: ThemedBadgeProps) => HTMLElement;
  /** Breadcrumb suite with Item sub-component for router-integrated navigation. */
  Breadcrumb: StyledPrimitive<typeof ComposedBreadcrumb>;
  /** Card suite with sub-components (Card.Header, Card.Title, etc.). */
  Card: StyledPrimitive<typeof ComposedCard>;
  /** Input component with theme styles. */
  Input: (props: Omit<ComposedInputProps, 'classes'>) => HTMLElement;
  /** Textarea component with theme styles. */
  Textarea: (props: Omit<ComposedTextareaProps, 'classes'>) => HTMLElement;
  /** Label component with theme styles. */
  Label: (props: Omit<ComposedLabelProps, 'classes'>) => HTMLElement;
  /** Pagination component — page navigation controls. */
  Pagination: (props: Omit<ComposedPaginationProps, 'classes'>) => HTMLElement;
  /** Separator component with theme styles. */
  Separator: (props: Omit<ComposedSeparatorProps, 'classes'>) => HTMLElement;
  /** FormGroup with sub-components (FormGroup.FormError). */
  FormGroup: StyledPrimitive<typeof ComposedFormGroup>;
  /** Avatar with sub-components (Avatar.Image, Avatar.Fallback). */
  Avatar: StyledPrimitive<typeof ComposedAvatar>;
  /** EmptyState component — placeholder for empty content areas with Icon, Title, Description, Action. */
  EmptyState: StyledPrimitive<typeof ComposedEmptyState>;
  /** Skeleton component — loading placeholder with pulse animation. */
  Skeleton: ((props: Omit<ComposedSkeletonProps, 'classes'>) => HTMLElement) & {
    Text: (props: Omit<ComposedSkeletonTextProps, 'classes'>) => HTMLElement;
    Circle: (props: Omit<ComposedSkeletonCircleProps, 'classes'>) => HTMLElement;
  };
  /** Table suite with sub-components (Table.Header, Table.Body, Table.Row, etc.). */
  Table: StyledPrimitive<typeof ComposedTable>;
  /** Themed primitive factories. */
  primitives: ThemedPrimitives;
}

/** Return type of configureTheme(). */
export interface ResolvedTheme extends ResolvedThemeBase {
  /** Pre-built style definitions. */
  styles: ThemeStyles;
  /** Component functions — ready-to-use themed elements. */
  components: ThemeComponents;
}

/**
 * Configure the shadcn theme.
 *
 * Single entry point — selects palette, applies overrides, builds globals, styles, and components.
 *
 * For a lightweight alternative that only returns `{ theme, globals }` without
 * component styles, use `configureThemeBase()` from `@vertz/theme-shadcn/base`.
 */
export function configureTheme(config?: ThemeConfig): ResolvedTheme {
  const { theme, globals } = configureThemeBase(config);

  // Inject global CSS for stack-rendered dialogs eagerly (small, always needed)
  createDialogGlobalStyles();

  // ── Lazy style initialization ──────────────────────────────────
  // Style factories are deferred until first access. This avoids ~40KB of CSS
  // compilation when configureTheme() is called but only a subset of components
  // are actually rendered (e.g., SSR pages that use Button + Card but not Dialog).

  const styleCache = new Map<string, unknown>();

  /** Shared lazy initializer — caches factory result by key. */
  function getOrInit<T>(key: string, factory: () => T): T {
    let value = styleCache.get(key) as T | undefined;
    if (value === undefined) {
      value = factory();
      styleCache.set(key, value);
    }
    return value;
  }

  /** Define a lazy getter on the styles object. Re-injects CSS on every
   *  access so the per-request SSR tracker captures it (Option A). The
   *  global injectedCSS Set dedup prevents duplicate DOM injection. */
  function defineLazyStyle(key: string, factory: () => unknown): void {
    Object.defineProperty(styles, key, {
      get() {
        const result = getOrInit(key, factory);
        // Re-inject CSS for per-request tracking (global Set dedup prevents duplicates)
        const cssText = (result as { css?: string }).css;
        if (cssText) injectCSS(cssText);
        return result;
      },
      enumerable: true,
      configurable: true,
    });
  }

  const styles = {} as ThemeStyles;

  defineLazyStyle('alert', createAlertStyles);
  defineLazyStyle('button', createButton);
  defineLazyStyle('badge', createBadge);
  defineLazyStyle('card', createCard);
  defineLazyStyle('input', createInput);
  defineLazyStyle('textarea', createTextarea);
  defineLazyStyle('label', createLabel);
  defineLazyStyle('separator', createSeparator);
  defineLazyStyle('formGroup', createFormGroup);
  defineLazyStyle('dialog', createDialogStyles);
  defineLazyStyle('dropdownMenu', createDropdownMenuStyles);
  defineLazyStyle('select', createSelectStyles);
  defineLazyStyle('tabs', createTabsStyles);
  defineLazyStyle('checkbox', createCheckboxStyles);
  defineLazyStyle('switch', createSwitchStyles);
  defineLazyStyle('popover', createPopoverStyles);
  defineLazyStyle('progress', createProgressStyles);
  defineLazyStyle('radioGroup', createRadioGroupStyles);
  defineLazyStyle('slider', createSliderStyles);
  defineLazyStyle('accordion', createAccordionStyles);
  defineLazyStyle('toast', createToastStyles);
  defineLazyStyle('tooltip', createTooltipStyles);
  defineLazyStyle('avatar', createAvatarStyles);
  defineLazyStyle('emptyState', createEmptyStateStyles);
  defineLazyStyle('skeleton', createSkeletonStyles);
  defineLazyStyle('table', createTableStyles);
  defineLazyStyle('sheet', createSheetStyles);
  defineLazyStyle('breadcrumb', createBreadcrumbStyles);
  defineLazyStyle('calendar', createCalendarStyles);
  defineLazyStyle('carousel', createCarouselStyles);
  defineLazyStyle('collapsible', createCollapsibleStyles);
  defineLazyStyle('command', createCommandStyles);
  defineLazyStyle('contextMenu', createContextMenuStyles);
  defineLazyStyle('datePicker', createDatePickerStyles);
  defineLazyStyle('drawer', createDrawerStyles);
  defineLazyStyle('hoverCard', createHoverCardStyles);
  defineLazyStyle('list', createListStyles);
  defineLazyStyle('menubar', createMenubarStyles);
  defineLazyStyle('navigationMenu', createNavigationMenuStyles);
  defineLazyStyle('pagination', createPaginationStyles);
  defineLazyStyle('resizablePanel', createResizablePanelStyles);
  defineLazyStyle('scrollArea', createScrollAreaStyles);
  defineLazyStyle('toggle', createToggleStyles);
  defineLazyStyle('toggleGroup', createToggleGroupStyles);

  // ── Lazy component initialization ──────────────────────────────
  // Components reference styles at creation time (withStyles, createThemed*),
  // so they must also be deferred. Built on first access of result.components.

  let cachedComponents: ThemeComponents | undefined;

  function buildComponents(): ThemeComponents {
    // Access styles through shared cache — no double initialization
    const alertS = getOrInit('alert', createAlertStyles);
    const buttonS = getOrInit('button', createButton);
    const badgeS = getOrInit('badge', createBadge);
    const cardS = getOrInit('card', createCard);
    const inputS = getOrInit('input', createInput);
    const textareaS = getOrInit('textarea', createTextarea);
    const labelS = getOrInit('label', createLabel);
    const separatorS = getOrInit('separator', createSeparator);
    const formGroupS = getOrInit('formGroup', createFormGroup);
    const breadcrumbS = getOrInit('breadcrumb', createBreadcrumbStyles);
    const paginationS = getOrInit('pagination', createPaginationStyles);
    const avatarS = getOrInit('avatar', createAvatarStyles);
    const emptyStateS = getOrInit('emptyState', createEmptyStateStyles);
    const skeletonS = getOrInit('skeleton', createSkeletonStyles);
    const tableS = getOrInit('table', createTableStyles);
    const dropdownMenuS = getOrInit('dropdownMenu', createDropdownMenuStyles);
    const selectS = getOrInit('select', createSelectStyles);
    const tabsS = getOrInit('tabs', createTabsStyles);
    const checkboxS = getOrInit('checkbox', createCheckboxStyles);
    const switchS = getOrInit('switch', createSwitchStyles);
    const popoverS = getOrInit('popover', createPopoverStyles);
    const progressS = getOrInit('progress', createProgressStyles);
    const radioGroupS = getOrInit('radioGroup', createRadioGroupStyles);
    const sliderS = getOrInit('slider', createSliderStyles);
    const accordionS = getOrInit('accordion', createAccordionStyles);
    const toastS = getOrInit('toast', createToastStyles);
    const tooltipS = getOrInit('tooltip', createTooltipStyles);
    const sheetS = getOrInit('sheet', createSheetStyles);
    const calendarS = getOrInit('calendar', createCalendarStyles);
    const carouselS = getOrInit('carousel', createCarouselStyles);
    const collapsibleS = getOrInit('collapsible', createCollapsibleStyles);
    const commandS = getOrInit('command', createCommandStyles);
    const contextMenuS = getOrInit('contextMenu', createContextMenuStyles);
    const datePickerS = getOrInit('datePicker', createDatePickerStyles);
    const drawerS = getOrInit('drawer', createDrawerStyles);
    const hoverCardS = getOrInit('hoverCard', createHoverCardStyles);
    const listS = getOrInit('list', createListStyles);
    const menubarS = getOrInit('menubar', createMenubarStyles);
    const navigationMenuS = getOrInit('navigationMenu', createNavigationMenuStyles);
    const resizablePanelS = getOrInit('resizablePanel', createResizablePanelStyles);
    const scrollAreaS = getOrInit('scrollArea', createScrollAreaStyles);
    const toggleS = getOrInit('toggle', createToggleStyles);
    const toggleGroupS = getOrInit('toggleGroup', createToggleGroupStyles);

    // Inline color styles for Badge (defined once, not per-call)
    const badgeColorInlineStyles: Record<string, Record<string, string>> = {
      blue: { backgroundColor: 'oklch(0.55 0.15 250)', color: '#fff' },
      green: { backgroundColor: 'oklch(0.55 0.15 155)', color: '#fff' },
      yellow: { backgroundColor: 'oklch(0.75 0.15 85)', color: 'oklch(0.25 0.05 85)' },
    };

    // Alert variant wrapper — selects class set based on variant prop
    const DefaultAlert = withStyles(ComposedAlert, {
      root: alertS.root,
      title: alertS.title,
      description: alertS.description,
    });
    const DestructiveAlert = withStyles(ComposedAlert, {
      root: [alertS.root, alertS.destructive].join(' '),
      title: alertS.title,
      description: alertS.description,
    });
    function ThemedAlert({ variant, ...rest }: ThemedAlertProps) {
      return (variant === 'destructive' ? DestructiveAlert : DefaultAlert)(rest);
    }
    const Alert = Object.assign(ThemedAlert, {
      Title: ComposedAlert.Title,
      Description: ComposedAlert.Description,
    }) as ThemeComponents['Alert'];

    return {
      Alert,
      Button: ({ intent, size, ...rest }: ThemedButtonProps) =>
        ComposedButton({ ...rest, classes: { base: buttonS({ intent, size }) } }),
      Badge: ({ color, ...rest }: ThemedBadgeProps) => {
        const style = color ? badgeColorInlineStyles[color] : undefined;
        return ComposedBadge({ ...rest, classes: { base: badgeS({ color }) }, style });
      },
      Breadcrumb: withStyles(ComposedBreadcrumb, {
        nav: breadcrumbS.nav,
        list: breadcrumbS.list,
        item: breadcrumbS.item,
        link: breadcrumbS.link,
        page: breadcrumbS.page,
        separator: breadcrumbS.separator,
      }),
      Card: withStyles(ComposedCard, {
        root: cardS.root,
        header: cardS.header,
        title: cardS.title,
        description: cardS.description,
        content: cardS.content,
        footer: cardS.footer,
        action: cardS.action,
      }),
      Input: withStyles(ComposedInput, { base: inputS.base }),
      Textarea: withStyles(ComposedTextarea, { base: textareaS.base }),
      Label: withStyles(ComposedLabel, { base: labelS.base }),
      Pagination: (props: Omit<ComposedPaginationProps, 'classes'>) =>
        ComposedPagination({
          ...props,
          classes: {
            nav: paginationS.nav,
            list: paginationS.list,
            item: paginationS.item,
            link: paginationS.link,
            linkActive: paginationS.linkActive,
            navButton: paginationS.navButton,
            ellipsis: paginationS.ellipsis,
          },
        }),
      Separator: withStyles(ComposedSeparator, {
        base: separatorS.base,
        horizontal: separatorS.horizontal,
        vertical: separatorS.vertical,
      }),
      FormGroup: withStyles(ComposedFormGroup, {
        base: formGroupS.base,
        error: formGroupS.error,
      }),
      Avatar: withStyles(ComposedAvatar, {
        root: avatarS.root,
        image: avatarS.image,
        fallback: avatarS.fallback,
      }),
      EmptyState: withStyles(ComposedEmptyState, {
        root: emptyStateS.root,
        icon: emptyStateS.icon,
        title: emptyStateS.title,
        description: emptyStateS.description,
        action: emptyStateS.action,
      }),
      Skeleton: Object.assign(withStyles(ComposedSkeleton, { root: skeletonS.root }), {
        Text: withStyles(ComposedSkeleton.Text, {
          root: skeletonS.textRoot,
          line: skeletonS.textLine,
        }),
        Circle: withStyles(ComposedSkeleton.Circle, {
          root: skeletonS.circleRoot,
        }),
      }) as ThemeComponents['Skeleton'],
      Table: withStyles(ComposedTable, {
        root: tableS.root,
        header: tableS.header,
        body: tableS.body,
        row: tableS.row,
        head: tableS.head,
        cell: tableS.cell,
        caption: tableS.caption,
        footer: tableS.footer,
      }),
      primitives: {
        Dialog: createThemedDialog(),
        DropdownMenu: createThemedDropdownMenu(dropdownMenuS),
        Select: createThemedSelect(selectS),
        Tabs: createThemedTabs(tabsS),
        Checkbox: createThemedCheckbox(checkboxS),
        Switch: createThemedSwitch(switchS),
        Popover: createThemedPopover(popoverS),
        Progress: createThemedProgress(progressS),
        RadioGroup: createThemedRadioGroup(radioGroupS),
        Slider: createThemedSlider(sliderS),
        Accordion: createThemedAccordion(accordionS),
        Toast: createThemedToast(toastS),
        Tooltip: createThemedTooltip(tooltipS),
        Sheet: createThemedSheet(sheetS),
        Calendar: createThemedCalendar(calendarS),
        Carousel: createThemedCarousel(carouselS),
        Collapsible: createThemedCollapsible(collapsibleS),
        Command: createThemedCommand(commandS),
        ContextMenu: createThemedContextMenu(contextMenuS),
        DatePicker: createThemedDatePicker(datePickerS, {
          ...calendarS,
          root: calendarS.rootNoBorder,
        }),
        Drawer: createThemedDrawer(drawerS),
        HoverCard: createThemedHoverCard(hoverCardS),
        List: createThemedList(listS),
        Menubar: createThemedMenubar(menubarS),
        NavigationMenu: createThemedNavigationMenu(navigationMenuS),
        ResizablePanel: createThemedResizablePanel(resizablePanelS),
        ScrollArea: createThemedScrollArea(scrollAreaS),
        Toggle: createThemedToggle(toggleS),
        ToggleGroup: createThemedToggleGroup(toggleGroupS),
      },
    };
  }

  const result = { theme, globals, styles } as ResolvedTheme;
  Object.defineProperty(result, 'components', {
    get() {
      if (cachedComponents === undefined) {
        cachedComponents = buildComponents();
      }
      return cachedComponents;
    },
    enumerable: true,
    configurable: true,
  });

  return result;
}
