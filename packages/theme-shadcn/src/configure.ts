import type { VariantFunction } from '@vertz/ui';
import type { ToastOptions } from '@vertz/ui-primitives';
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
import type { ThemedAccordionComponent } from './components/primitives/accordion';
import { createThemedAccordion } from './components/primitives/accordion';
import type { ThemedAlertDialogComponent } from './components/primitives/alert-dialog';
import { createThemedAlertDialog } from './components/primitives/alert-dialog';
import type { ThemedCalendarComponent } from './components/primitives/calendar';
import { createThemedCalendar } from './components/primitives/calendar';
import { createThemedCarousel } from './components/primitives/carousel';
import type { ThemedCheckboxComponent } from './components/primitives/checkbox';
import { createThemedCheckbox } from './components/primitives/checkbox';
import { createThemedCollapsible } from './components/primitives/collapsible';
import { createThemedCommand } from './components/primitives/command';
import { createThemedContextMenu } from './components/primitives/context-menu';
import { createThemedDatePicker } from './components/primitives/date-picker';
import type { ThemedDialogComponent } from './components/primitives/dialog';
import { createThemedDialog } from './components/primitives/dialog';
import { createThemedDrawer } from './components/primitives/drawer';
import type { ThemedDropdownMenuComponent } from './components/primitives/dropdown-menu';
import { createThemedDropdownMenu } from './components/primitives/dropdown-menu';
import { createThemedHoverCard } from './components/primitives/hover-card';
import { createThemedMenubar } from './components/primitives/menubar';
import { createThemedNavigationMenu } from './components/primitives/navigation-menu';
import type { ThemedPopoverComponent } from './components/primitives/popover';
import { createThemedPopover } from './components/primitives/popover';
import type { ThemedProgressComponent } from './components/primitives/progress';
import { createThemedProgress } from './components/primitives/progress';
import type { ThemedRadioGroupComponent } from './components/primitives/radio-group';
import { createThemedRadioGroup } from './components/primitives/radio-group';
import { createThemedResizablePanel } from './components/primitives/resizable-panel';
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
import { createThemedToggleGroup } from './components/primitives/toggle-group';
import type { ThemedTooltipComponent } from './components/primitives/tooltip';
import { createThemedTooltip } from './components/primitives/tooltip';
import type { SeparatorProps } from './components/separator';
import { createSeparatorComponent } from './components/separator';
import type { SkeletonComponents } from './components/skeleton';
import { createSkeletonComponents } from './components/skeleton';
import type { TableComponents } from './components/table';
import { createTableComponents } from './components/table';
import type { TextareaProps } from './components/textarea';
import { createTextareaComponent } from './components/textarea';
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
  /** Themed AlertDialog — composable JSX component with AlertDialog.Trigger, AlertDialog.Content, etc. */
  AlertDialog: ThemedAlertDialogComponent;
  /** Themed Dialog — composable JSX component with Dialog.Trigger, Dialog.Content, Dialog.Title, Dialog.Description, Dialog.Footer. */
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
  /** Themed Toggle — composable JSX component wrapping @vertz/ui-primitives Toggle. */
  Toggle: ThemedToggleComponent;
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
      AlertDialog: createThemedAlertDialog(alertDialogStyles),
      Dialog: createThemedDialog(dialogStyles),
      DropdownMenu: createThemedDropdownMenu(dropdownMenuStyles),
      Select: createThemedSelect(selectStyles),
      Tabs: createThemedTabs(tabsStyles),
      Checkbox: createThemedCheckbox(checkboxStyles),
      Switch: createThemedSwitch(switchStyles),
      Popover: createThemedPopover(popoverStyles),
      Progress: createThemedProgress(progressStyles),
      RadioGroup: createThemedRadioGroup(radioGroupStyles),
      Slider: createThemedSlider(sliderStyles),
      Accordion: createThemedAccordion(accordionStyles),
      Toast: createThemedToast(toastStyles),
      Tooltip: createThemedTooltip(tooltipStyles),
      Sheet: createThemedSheet(sheetStyles),
      Calendar: createThemedCalendar(calendarStyles),
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
      Toggle: createThemedToggle(toggleStyles),
      toggleGroup: createThemedToggleGroup(toggleGroupStyles),
    },
  };

  return { theme, globals, styles, components };
}
