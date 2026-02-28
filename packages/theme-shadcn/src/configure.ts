import type { GlobalCSSOutput, Theme, VariantFunction } from '@vertz/ui';
import { defineTheme, globalCss } from '@vertz/ui';
import type {
  AccordionOptions,
  CheckboxElements,
  CheckboxOptions,
  CheckboxState,
  DialogElements,
  DialogOptions,
  DialogState,
  MenuOptions,
  PopoverElements,
  PopoverOptions,
  PopoverState,
  ProgressElements,
  ProgressOptions,
  ProgressState,
  RadioOptions,
  SelectOptions,
  SliderElements,
  SliderOptions,
  SliderState,
  SwitchElements,
  SwitchState,
  ToastOptions,
  TooltipElements,
  TooltipOptions,
  TooltipState,
} from '@vertz/ui-primitives';
import type { AlertComponents } from './components/alert';
import { createAlertComponents } from './components/alert';
import type { AvatarComponents } from './components/avatar';
import { createAvatarComponents } from './components/avatar';
import type { BadgeProps } from './components/badge';
import { createBadgeComponent } from './components/badge';
import type { BreadcrumbComponents } from './components/breadcrumb';
import { createBreadcrumbComponent } from './components/breadcrumb';
import type { ButtonProps } from './components/button';
import { createButtonComponent } from './components/button';
import type { CardComponents } from './components/card';
import { createCardComponents } from './components/card';
import type { FormGroupComponents } from './components/form-group';
import { createFormGroupComponents } from './components/form-group';
import type { InputProps } from './components/input';
import { createInputComponent } from './components/input';
import type { LabelProps } from './components/label';
import { createLabelComponent } from './components/label';
import type { PaginationComponents } from './components/pagination';
import { createPaginationComponent } from './components/pagination';
import type { ThemedAccordionResult } from './components/primitives/accordion';
import { createThemedAccordion } from './components/primitives/accordion';
import type { AlertDialogElements, AlertDialogOptions } from './components/primitives/alert-dialog';
import { createThemedAlertDialog } from './components/primitives/alert-dialog';
import { createThemedCalendar } from './components/primitives/calendar';
import { createThemedCarousel } from './components/primitives/carousel';
import { createThemedCheckbox } from './components/primitives/checkbox';
import { createThemedCollapsible } from './components/primitives/collapsible';
import { createThemedCommand } from './components/primitives/command';
import { createThemedContextMenu } from './components/primitives/context-menu';
import { createThemedDatePicker } from './components/primitives/date-picker';
import { createThemedDialog } from './components/primitives/dialog';
import { createThemedDrawer } from './components/primitives/drawer';
import type { ThemedDropdownMenuResult } from './components/primitives/dropdown-menu';
import { createThemedDropdownMenu } from './components/primitives/dropdown-menu';
import { createThemedHoverCard } from './components/primitives/hover-card';
import { createThemedMenubar } from './components/primitives/menubar';
import { createThemedNavigationMenu } from './components/primitives/navigation-menu';
import { createThemedPopover } from './components/primitives/popover';
import { createThemedProgress } from './components/primitives/progress';
import type { ThemedRadioGroupResult } from './components/primitives/radio-group';
import { createThemedRadioGroup } from './components/primitives/radio-group';
import { createThemedResizablePanel } from './components/primitives/resizable-panel';
import { createThemedScrollArea } from './components/primitives/scroll-area';
import type { ThemedSelectResult } from './components/primitives/select';
import { createThemedSelect } from './components/primitives/select';
import type { ThemedSheetOptions } from './components/primitives/sheet';
import { createThemedSheet } from './components/primitives/sheet';
import { createThemedSlider } from './components/primitives/slider';
import type { ThemedSwitchOptions } from './components/primitives/switch';
import { createThemedSwitch } from './components/primitives/switch';
import type { ThemedTabsOptions, ThemedTabsResult } from './components/primitives/tabs';
import { createThemedTabs } from './components/primitives/tabs';
import type { ThemedToastResult } from './components/primitives/toast';
import { createThemedToast } from './components/primitives/toast';
import { createThemedToggle } from './components/primitives/toggle';
import { createThemedToggleGroup } from './components/primitives/toggle-group';
import { createThemedTooltip } from './components/primitives/tooltip';
import type { SeparatorProps } from './components/separator';
import { createSeparatorComponent } from './components/separator';
import type { SkeletonComponents } from './components/skeleton';
import { createSkeletonComponents } from './components/skeleton';
import type { TableComponents } from './components/table';
import { createTableComponents } from './components/table';
import type { TextareaProps } from './components/textarea';
import { createTextareaComponent } from './components/textarea';
import { deepMergeTokens } from './merge';
import {
  createAccordionStyles,
  createAlertDialogStyles,
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
  createDialogStyles,
  createDrawerStyles,
  createDropdownMenuStyles,
  createFormGroup,
  createHoverCardStyles,
  createInput,
  createLabel,
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
import type { PaletteName } from './tokens';
import { palettes } from './tokens';
import type { PaletteTokens } from './types';

/** Configuration options for the shadcn theme. */
export interface ThemeConfig {
  /** Color palette base. Default: 'zinc'. */
  palette?: PaletteName;
  /** Border radius preset. Default: 'md'. */
  radius?: 'sm' | 'md' | 'lg';
  /** Token overrides — deep-merged into the selected palette. */
  overrides?: {
    tokens?: {
      colors?: Record<string, Record<string, string> | undefined>;
    };
  };
}

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
    readonly css: string;
  };
  /** Slider css() styles. */
  slider: {
    readonly root: string;
    readonly track: string;
    readonly thumb: string;
    readonly css: string;
  };
  /** AlertDialog css() styles. */
  alertDialog: {
    readonly overlay: string;
    readonly panel: string;
    readonly title: string;
    readonly description: string;
    readonly footer: string;
    readonly cancel: string;
    readonly action: string;
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
  /** Skeleton css() styles. */
  skeleton: {
    readonly base: string;
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
  /** Themed AlertDialog — modal dialog requiring explicit confirm/cancel action. */
  alertDialog: (options?: AlertDialogOptions) => AlertDialogElements;
  /** Themed Dialog — wraps @vertz/ui-primitives Dialog with shadcn styles. */
  dialog: (options?: DialogOptions) => DialogElements & { state: DialogState };
  /** Themed DropdownMenu — wraps @vertz/ui-primitives Menu with shadcn styles. */
  dropdownMenu: (options?: MenuOptions) => ThemedDropdownMenuResult;
  /** Themed Select — wraps @vertz/ui-primitives Select with shadcn styles. */
  select: (options?: SelectOptions) => ThemedSelectResult;
  /** Themed Tabs — wraps @vertz/ui-primitives Tabs with shadcn styles. */
  tabs: (options?: ThemedTabsOptions) => ThemedTabsResult;
  /** Themed Checkbox — wraps @vertz/ui-primitives Checkbox with shadcn styles. */
  checkbox: (options?: CheckboxOptions) => CheckboxElements & { state: CheckboxState };
  /** Themed Switch — wraps @vertz/ui-primitives Switch with shadcn styles. */
  switch: (options?: ThemedSwitchOptions) => SwitchElements & { state: SwitchState };
  /** Themed Popover — wraps @vertz/ui-primitives Popover with shadcn styles. */
  popover: (options?: PopoverOptions) => PopoverElements & { state: PopoverState };
  /** Themed Progress — wraps @vertz/ui-primitives Progress with shadcn styles. */
  progress: (
    options?: ProgressOptions,
  ) => ProgressElements & { state: ProgressState; setValue: (value: number) => void };
  /** Themed RadioGroup — wraps @vertz/ui-primitives Radio with shadcn styles. */
  radioGroup: (options?: RadioOptions) => ThemedRadioGroupResult;
  /** Themed Slider — wraps @vertz/ui-primitives Slider with shadcn styles. */
  slider: (options?: SliderOptions) => SliderElements & { state: SliderState };
  /** Themed Accordion — wraps @vertz/ui-primitives Accordion with shadcn styles. */
  accordion: (options?: AccordionOptions) => ThemedAccordionResult;
  /** Themed Toast — wraps @vertz/ui-primitives Toast with shadcn styles. */
  toast: (options?: ToastOptions) => ThemedToastResult;
  /** Themed Tooltip — wraps @vertz/ui-primitives Tooltip with shadcn styles. */
  tooltip: (options?: TooltipOptions) => TooltipElements & { state: TooltipState };
  /** Themed Sheet — side panel wrapping Dialog with directional slide animations. */
  sheet: (options?: ThemedSheetOptions) => DialogElements & { state: DialogState };
  /** Themed Calendar — date grid with month navigation. */
  calendar: ReturnType<typeof createThemedCalendar>;
  /** Themed Carousel — slide navigation with prev/next controls. */
  carousel: ReturnType<typeof createThemedCarousel>;
  /** Themed Collapsible — expandable/collapsible content section. */
  collapsible: ReturnType<typeof createThemedCollapsible>;
  /** Themed Command — searchable command palette. */
  command: ReturnType<typeof createThemedCommand>;
  /** Themed ContextMenu — right-click context menu. */
  contextMenu: ReturnType<typeof createThemedContextMenu>;
  /** Themed DatePicker — date picker composing Calendar + Popover. */
  datePicker: ReturnType<typeof createThemedDatePicker>;
  /** Themed Drawer — bottom/side panel wrapping Dialog. */
  drawer: ReturnType<typeof createThemedDrawer>;
  /** Themed HoverCard — hover-triggered interactive card. */
  hoverCard: ReturnType<typeof createThemedHoverCard>;
  /** Themed Menubar — horizontal menu bar with dropdowns. */
  menubar: ReturnType<typeof createThemedMenubar>;
  /** Themed NavigationMenu — site navigation with hover dropdowns. */
  navigationMenu: ReturnType<typeof createThemedNavigationMenu>;
  /** Themed ResizablePanel — resizable panel layout with drag handles. */
  resizablePanel: ReturnType<typeof createThemedResizablePanel>;
  /** Themed ScrollArea — custom scrollbars. */
  scrollArea: ReturnType<typeof createThemedScrollArea>;
  /** Themed Toggle — toggle button with pressed state. */
  toggle: ReturnType<typeof createThemedToggle>;
  /** Themed ToggleGroup — group of toggle buttons. */
  toggleGroup: ReturnType<typeof createThemedToggleGroup>;
}

/** Component functions returned by configureTheme(). */
export interface ThemeComponents {
  /** Alert suite — Alert, AlertTitle, AlertDescription. */
  Alert: AlertComponents;
  /** Button component — returns HTMLButtonElement with theme styles. */
  Button: (props: ButtonProps) => HTMLButtonElement;
  /** Badge component — returns HTMLSpanElement with theme styles. */
  Badge: (props: BadgeProps) => HTMLSpanElement;
  /** Breadcrumb component — navigation breadcrumb trail. */
  Breadcrumb: BreadcrumbComponents;
  /** Card suite — Card, CardHeader, CardTitle, etc. */
  Card: CardComponents;
  /** Input component — returns HTMLInputElement with theme styles. */
  Input: (props: InputProps) => HTMLInputElement;
  /** Textarea component — returns HTMLTextAreaElement with theme styles. */
  Textarea: (props: TextareaProps) => HTMLTextAreaElement;
  /** Label component — returns HTMLLabelElement with theme styles. */
  Label: (props: LabelProps) => HTMLLabelElement;
  /** Pagination component — page navigation controls. */
  Pagination: PaginationComponents;
  /** Separator component — returns HTMLHRElement with theme styles. */
  Separator: (props: SeparatorProps) => HTMLHRElement;
  /** FormGroup suite — FormGroup and FormError. */
  FormGroup: FormGroupComponents;
  /** Avatar suite — Avatar, AvatarImage, AvatarFallback. */
  Avatar: AvatarComponents;
  /** Skeleton component — loading placeholder with pulse animation. */
  Skeleton: SkeletonComponents;
  /** Table suite — Table, TableHeader, TableBody, TableRow, etc. */
  Table: TableComponents;
  /** Themed primitive factories. */
  primitives: ThemedPrimitives;
}

/** Return type of configureTheme(). */
export interface ResolvedTheme {
  /** Theme object for compileTheme(). */
  theme: Theme;
  /** Global CSS (reset, typography, radius). Auto-injected via globalCss(). */
  globals: GlobalCSSOutput;
  /** Pre-built style definitions. */
  styles: ThemeStyles;
  /** Component functions — ready-to-use themed elements. */
  components: ThemeComponents;
}

const RADIUS_VALUES: Record<string, string> = {
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
};

/**
 * Configure the shadcn theme.
 *
 * Single entry point — selects palette, applies overrides, builds globals, styles, and components.
 */
export function configureTheme(config?: ThemeConfig): ResolvedTheme {
  const palette = config?.palette ?? 'zinc';
  const radius = config?.radius ?? 'md';
  const baseTokens = palettes[palette];

  // Apply token overrides
  const colorOverrides = config?.overrides?.tokens?.colors ?? {};
  const mergedTokens: PaletteTokens = deepMergeTokens(baseTokens, colorOverrides);

  // Build theme via defineTheme()
  const theme = defineTheme({ colors: mergedTokens });

  // Build globals: CSS reset + base typography + radius
  const globals = globalCss({
    '*, *::before, *::after': {
      boxSizing: 'border-box',
      margin: '0',
      padding: '0',
      borderWidth: '0',
      borderStyle: 'solid',
      borderColor: 'var(--color-border)',
    },
    'button, input, select, textarea': {
      font: 'inherit',
      color: 'inherit',
    },
    ':root': {
      '--radius': RADIUS_VALUES[radius] ?? '0.375rem',
    },
    body: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      lineHeight: '1.5',
      color: 'var(--color-foreground)',
      backgroundColor: 'var(--color-background)',
    },
  });

  // Build style definitions (simple + primitive)
  const buttonStyles = createButton();
  const badgeStyles = createBadge();
  const cardStyles = createCard();
  const inputStyles = createInput();
  const labelStyles = createLabel();
  const separatorStyles = createSeparator();
  const formGroupStyles = createFormGroup();
  const dialogStyles = createDialogStyles();
  const dropdownMenuStyles = createDropdownMenuStyles();
  const selectStyles = createSelectStyles();
  const tabsStyles = createTabsStyles();
  const checkboxStyles = createCheckboxStyles();
  const switchStyles = createSwitchStyles();
  const popoverStyles = createPopoverStyles();
  const progressStyles = createProgressStyles();
  const radioGroupStyles = createRadioGroupStyles();
  const sliderStyles = createSliderStyles();
  const alertStyles = createAlertStyles();
  const alertDialogStyles = createAlertDialogStyles();
  const accordionStyles = createAccordionStyles();
  const textareaStyles = createTextarea();
  const toastStyles = createToastStyles();
  const tooltipStyles = createTooltipStyles();
  const avatarStyles = createAvatarStyles();
  const skeletonStyles = createSkeletonStyles();
  const tableStyles = createTableStyles();
  const sheetStyles = createSheetStyles();
  const breadcrumbStyles = createBreadcrumbStyles();
  const calendarStyles = createCalendarStyles();
  const carouselStyles = createCarouselStyles();
  const collapsibleStyles = createCollapsibleStyles();
  const commandStyles = createCommandStyles();
  const contextMenuStyles = createContextMenuStyles();
  const datePickerStyles = createDatePickerStyles();
  const drawerStyles = createDrawerStyles();
  const hoverCardStyles = createHoverCardStyles();
  const menubarStyles = createMenubarStyles();
  const navigationMenuStyles = createNavigationMenuStyles();
  const paginationStyles = createPaginationStyles();
  const resizablePanelStyles = createResizablePanelStyles();
  const scrollAreaStyles = createScrollAreaStyles();
  const toggleStyles = createToggleStyles();
  const toggleGroupStyles = createToggleGroupStyles();

  const styles: ThemeStyles = {
    alert: alertStyles,
    alertDialog: alertDialogStyles,
    button: buttonStyles,
    badge: badgeStyles,
    card: cardStyles,
    input: inputStyles,
    textarea: textareaStyles,
    label: labelStyles,
    separator: separatorStyles,
    formGroup: formGroupStyles,
    dialog: dialogStyles,
    dropdownMenu: dropdownMenuStyles,
    select: selectStyles,
    tabs: tabsStyles,
    checkbox: checkboxStyles,
    switch: switchStyles,
    popover: popoverStyles,
    progress: progressStyles,
    radioGroup: radioGroupStyles,
    slider: sliderStyles,
    accordion: accordionStyles,
    toast: toastStyles,
    tooltip: tooltipStyles,
    avatar: avatarStyles,
    skeleton: skeletonStyles,
    table: tableStyles,
    sheet: sheetStyles,
    breadcrumb: breadcrumbStyles,
    calendar: calendarStyles,
    carousel: carouselStyles,
    collapsible: collapsibleStyles,
    command: commandStyles,
    contextMenu: contextMenuStyles,
    datePicker: datePickerStyles,
    drawer: drawerStyles,
    hoverCard: hoverCardStyles,
    menubar: menubarStyles,
    navigationMenu: navigationMenuStyles,
    pagination: paginationStyles,
    resizablePanel: resizablePanelStyles,
    scrollArea: scrollAreaStyles,
    toggle: toggleStyles,
    toggleGroup: toggleGroupStyles,
  };

  // Build component functions
  const components: ThemeComponents = {
    Alert: createAlertComponents(alertStyles),
    Button: createButtonComponent(buttonStyles),
    Badge: createBadgeComponent(badgeStyles),
    Breadcrumb: createBreadcrumbComponent(breadcrumbStyles),
    Card: createCardComponents(cardStyles),
    Input: createInputComponent(inputStyles),
    Textarea: createTextareaComponent(textareaStyles),
    Label: createLabelComponent(labelStyles),
    Pagination: createPaginationComponent(paginationStyles),
    Separator: createSeparatorComponent(separatorStyles),
    FormGroup: createFormGroupComponents(formGroupStyles),
    Avatar: createAvatarComponents(avatarStyles),
    Skeleton: createSkeletonComponents(skeletonStyles),
    Table: createTableComponents(tableStyles),
    primitives: {
      alertDialog: createThemedAlertDialog(alertDialogStyles),
      dialog: createThemedDialog(dialogStyles),
      dropdownMenu: createThemedDropdownMenu(dropdownMenuStyles),
      select: createThemedSelect(selectStyles),
      tabs: createThemedTabs(tabsStyles),
      checkbox: createThemedCheckbox(checkboxStyles),
      switch: createThemedSwitch(switchStyles),
      popover: createThemedPopover(popoverStyles),
      progress: createThemedProgress(progressStyles),
      radioGroup: createThemedRadioGroup(radioGroupStyles),
      slider: createThemedSlider(sliderStyles),
      accordion: createThemedAccordion(accordionStyles),
      toast: createThemedToast(toastStyles),
      tooltip: createThemedTooltip(tooltipStyles),
      sheet: createThemedSheet(sheetStyles),
      calendar: createThemedCalendar(calendarStyles),
      carousel: createThemedCarousel(carouselStyles),
      collapsible: createThemedCollapsible(collapsibleStyles),
      command: createThemedCommand(commandStyles),
      contextMenu: createThemedContextMenu(contextMenuStyles),
      datePicker: createThemedDatePicker(datePickerStyles),
      drawer: createThemedDrawer(drawerStyles),
      hoverCard: createThemedHoverCard(hoverCardStyles),
      menubar: createThemedMenubar(menubarStyles),
      navigationMenu: createThemedNavigationMenu(navigationMenuStyles),
      resizablePanel: createThemedResizablePanel(resizablePanelStyles),
      scrollArea: createThemedScrollArea(scrollAreaStyles),
      toggle: createThemedToggle(toggleStyles),
      toggleGroup: createThemedToggleGroup(toggleGroupStyles),
    },
  };

  return { theme, globals, styles, components };
}
