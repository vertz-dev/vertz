import { injectCSS } from '@vertz/ui';
import type { StyleBlock, VariantFunction } from '@vertz/ui';
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
import type { ThemedAppShellComponent } from './components/primitives/app-shell';
import { createThemedAppShell } from './components/primitives/app-shell';
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
  createAppShell,
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
    intent: Record<string, StyleBlock>;
    size: Record<string, StyleBlock>;
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
    color: Record<string, StyleBlock>;
  }>;
  /** AppShell css() result with root, sidebar, brand, nav, navItem, navItemActive, content, user. */
  appShell: {
    readonly root: string;
    readonly sidebar: string;
    readonly brand: string;
    readonly nav: string;
    readonly navItem: string;
    readonly navItemActive: string;
    readonly content: string;
    readonly user: string;
    readonly css: string;
  };
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
  /** AppShell layout with sidebar + content sub-components and NavItem for themed navigation. */
  AppShell: ThemedAppShellComponent;
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
 * Single entry point — selects palette, applies color overrides, builds globals, styles, and components.
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
  defineLazyStyle('appShell', createAppShell);
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

  // ── Per-component lazy initialization (#1979) ──────────────────
  // Each component compiles only its own styles when first accessed.
  // Previously, buildComponents() eagerly compiled ALL ~40 styles (~74KB CSS)
  // whenever .components was accessed (e.g., via registerTheme()).
  // Now, accessing components.Button only compiles button styles, etc.

  const components = {} as ThemeComponents;

  /** Define a lazy component getter — compiles styles on first access only. */
  function lazyComp(key: string, factory: () => unknown): void {
    let cached: unknown;
    Object.defineProperty(components, key, {
      get() {
        if (cached === undefined) cached = factory();
        return cached;
      },
      enumerable: true,
      configurable: true,
    });
  }

  // ── Direct components ──────────────────────────────────────────

  lazyComp('Alert', () => {
    const alertS = styles.alert;
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
    return Object.assign(ThemedAlert, {
      Title: ComposedAlert.Title,
      Description: ComposedAlert.Description,
    });
  });

  lazyComp('Button', () => {
    const buttonS = styles.button;
    return ({ intent, size, ...rest }: ThemedButtonProps) =>
      ComposedButton({ ...rest, classes: { base: buttonS({ intent, size }) } });
  });

  lazyComp('Badge', () => {
    const badgeS = styles.badge;
    const badgeColorInlineStyles: Record<string, Record<string, string>> = {
      blue: { backgroundColor: 'oklch(0.55 0.15 250)', color: '#fff' },
      green: { backgroundColor: 'oklch(0.55 0.15 155)', color: '#fff' },
      yellow: { backgroundColor: 'oklch(0.75 0.15 85)', color: 'oklch(0.25 0.05 85)' },
    };
    return ({ color, ...rest }: ThemedBadgeProps) => {
      const style = color ? badgeColorInlineStyles[color] : undefined;
      return ComposedBadge({ ...rest, classes: { base: badgeS({ color }) }, style });
    };
  });

  lazyComp('Breadcrumb', () => {
    const s = styles.breadcrumb;
    return withStyles(ComposedBreadcrumb, {
      nav: s.nav,
      list: s.list,
      item: s.item,
      link: s.link,
      page: s.page,
      separator: s.separator,
    });
  });

  lazyComp('AppShell', () => {
    const s = styles.appShell;
    return createThemedAppShell(s);
  });

  lazyComp('Card', () => {
    const s = styles.card;
    return withStyles(ComposedCard, {
      root: s.root,
      header: s.header,
      title: s.title,
      description: s.description,
      content: s.content,
      footer: s.footer,
      action: s.action,
    });
  });

  lazyComp('Input', () => withStyles(ComposedInput, { base: styles.input.base }));
  lazyComp('Textarea', () => withStyles(ComposedTextarea, { base: styles.textarea.base }));
  lazyComp('Label', () => withStyles(ComposedLabel, { base: styles.label.base }));

  lazyComp('Pagination', () => {
    const s = styles.pagination;
    return (props: Omit<ComposedPaginationProps, 'classes'>) =>
      ComposedPagination({
        ...props,
        classes: {
          nav: s.nav,
          list: s.list,
          item: s.item,
          link: s.link,
          linkActive: s.linkActive,
          navButton: s.navButton,
          ellipsis: s.ellipsis,
        },
      });
  });

  lazyComp('Separator', () => {
    const s = styles.separator as ReturnType<typeof createSeparator>;
    return withStyles(ComposedSeparator, {
      base: s.base,
      horizontal: s.horizontal,
      vertical: s.vertical,
    });
  });

  lazyComp('FormGroup', () => {
    const s = styles.formGroup;
    return withStyles(ComposedFormGroup, { base: s.base, error: s.error });
  });

  lazyComp('Avatar', () => {
    const s = styles.avatar;
    return withStyles(ComposedAvatar, { root: s.root, image: s.image, fallback: s.fallback });
  });

  lazyComp('EmptyState', () => {
    const s = styles.emptyState;
    return withStyles(ComposedEmptyState, {
      root: s.root,
      icon: s.icon,
      title: s.title,
      description: s.description,
      action: s.action,
    });
  });

  lazyComp('Skeleton', () => {
    const s = styles.skeleton;
    return Object.assign(withStyles(ComposedSkeleton, { root: s.root }), {
      Text: withStyles(ComposedSkeleton.Text, { root: s.textRoot, line: s.textLine }),
      Circle: withStyles(ComposedSkeleton.Circle, { root: s.circleRoot }),
    });
  });

  lazyComp('Table', () => {
    const s = styles.table;
    return withStyles(ComposedTable, {
      root: s.root,
      header: s.header,
      body: s.body,
      row: s.row,
      head: s.head,
      cell: s.cell,
      caption: s.caption,
      footer: s.footer,
    });
  });

  // ── Primitive components ───────────────────────────────────────

  const primitives = {} as ThemedPrimitives;

  function lazyPrim(key: string, factory: () => unknown): void {
    let cached: unknown;
    Object.defineProperty(primitives, key, {
      get() {
        if (cached === undefined) cached = factory();
        return cached;
      },
      enumerable: true,
      configurable: true,
    });
  }

  lazyPrim('Dialog', () => createThemedDialog());
  lazyPrim('DropdownMenu', () => createThemedDropdownMenu(styles.dropdownMenu));
  lazyPrim('Select', () =>
    createThemedSelect(styles.select as ReturnType<typeof createSelectStyles>),
  );
  lazyPrim('Tabs', () => createThemedTabs(styles.tabs));
  lazyPrim('Checkbox', () => createThemedCheckbox(styles.checkbox));
  lazyPrim('Switch', () => createThemedSwitch(styles.switch));
  lazyPrim('Popover', () => createThemedPopover(styles.popover));
  lazyPrim('Progress', () => createThemedProgress(styles.progress));
  lazyPrim('RadioGroup', () => createThemedRadioGroup(styles.radioGroup));
  lazyPrim('Slider', () => createThemedSlider(styles.slider));
  lazyPrim('Accordion', () => createThemedAccordion(styles.accordion));
  lazyPrim('Toast', () => createThemedToast(styles.toast));
  lazyPrim('Tooltip', () => createThemedTooltip(styles.tooltip));
  lazyPrim('Sheet', () => createThemedSheet(styles.sheet));
  lazyPrim('Calendar', () => createThemedCalendar(styles.calendar));
  lazyPrim('Carousel', () => createThemedCarousel(styles.carousel));
  lazyPrim('Collapsible', () => createThemedCollapsible(styles.collapsible));
  lazyPrim('Command', () => createThemedCommand(styles.command));
  lazyPrim('ContextMenu', () => createThemedContextMenu(styles.contextMenu));
  lazyPrim('DatePicker', () => {
    const calendarS = styles.calendar;
    return createThemedDatePicker(styles.datePicker, {
      ...calendarS,
      root: calendarS.rootNoBorder,
    });
  });
  lazyPrim('Drawer', () => createThemedDrawer(styles.drawer));
  lazyPrim('HoverCard', () => createThemedHoverCard(styles.hoverCard));
  lazyPrim('List', () => createThemedList(styles.list));
  lazyPrim('Menubar', () => createThemedMenubar(styles.menubar));
  lazyPrim('NavigationMenu', () => createThemedNavigationMenu(styles.navigationMenu));
  lazyPrim('ResizablePanel', () => createThemedResizablePanel(styles.resizablePanel));
  lazyPrim('ScrollArea', () => createThemedScrollArea(styles.scrollArea));
  lazyPrim('Toggle', () => createThemedToggle(styles.toggle));
  lazyPrim('ToggleGroup', () => createThemedToggleGroup(styles.toggleGroup));

  // Assign primitives sub-object — not lazy (it's the container, individual
  // primitives inside it have their own lazy getters).
  Object.defineProperty(components, 'primitives', {
    value: primitives,
    enumerable: true,
    configurable: true,
  });

  return { theme, globals, styles, components } as ResolvedTheme;
}
