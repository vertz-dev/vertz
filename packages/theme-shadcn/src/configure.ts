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
import type { BadgeProps } from './components/badge';
import { createBadgeComponent } from './components/badge';
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
import type { ThemedAccordionResult } from './components/primitives/accordion';
import { createThemedAccordion } from './components/primitives/accordion';
import type { AlertDialogElements, AlertDialogOptions } from './components/primitives/alert-dialog';
import { createThemedAlertDialog } from './components/primitives/alert-dialog';
import { createThemedCheckbox } from './components/primitives/checkbox';
import { createThemedDialog } from './components/primitives/dialog';
import type { ThemedDropdownMenuResult } from './components/primitives/dropdown-menu';
import { createThemedDropdownMenu } from './components/primitives/dropdown-menu';
import { createThemedPopover } from './components/primitives/popover';
import { createThemedProgress } from './components/primitives/progress';
import type { ThemedRadioGroupResult } from './components/primitives/radio-group';
import { createThemedRadioGroup } from './components/primitives/radio-group';
import type { ThemedSelectResult } from './components/primitives/select';
import { createThemedSelect } from './components/primitives/select';
import { createThemedSlider } from './components/primitives/slider';
import type { ThemedSwitchOptions } from './components/primitives/switch';
import { createThemedSwitch } from './components/primitives/switch';
import type { ThemedTabsOptions, ThemedTabsResult } from './components/primitives/tabs';
import { createThemedTabs } from './components/primitives/tabs';
import type { ThemedToastResult } from './components/primitives/toast';
import { createThemedToast } from './components/primitives/toast';
import { createThemedTooltip } from './components/primitives/tooltip';
import type { SeparatorProps } from './components/separator';
import { createSeparatorComponent } from './components/separator';
import type { TextareaProps } from './components/textarea';
import { createTextareaComponent } from './components/textarea';
import { deepMergeTokens } from './merge';
import {
  createAccordionStyles,
  createAlert,
  createAlertDialogStyles,
  createBadge,
  createButton,
  createCard,
  createCheckboxStyles,
  createDialogStyles,
  createDropdownMenuStyles,
  createFormGroup,
  createInput,
  createLabel,
  createPopoverStyles,
  createProgressStyles,
  createRadioGroupStyles,
  createSelectStyles,
  createSeparator,
  createSliderStyles,
  createSwitchStyles,
  createTabsStyles,
  createTextarea,
  createToastStyles,
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
}

/** Component functions returned by configureTheme(). */
export interface ThemeComponents {
  /** Alert suite — Alert, AlertTitle, AlertDescription. */
  Alert: AlertComponents;
  /** Button component — returns HTMLButtonElement with theme styles. */
  Button: (props: ButtonProps) => HTMLButtonElement;
  /** Badge component — returns HTMLSpanElement with theme styles. */
  Badge: (props: BadgeProps) => HTMLSpanElement;
  /** Card suite — Card, CardHeader, CardTitle, etc. */
  Card: CardComponents;
  /** Input component — returns HTMLInputElement with theme styles. */
  Input: (props: InputProps) => HTMLInputElement;
  /** Textarea component — returns HTMLTextAreaElement with theme styles. */
  Textarea: (props: TextareaProps) => HTMLTextAreaElement;
  /** Label component — returns HTMLLabelElement with theme styles. */
  Label: (props: LabelProps) => HTMLLabelElement;
  /** Separator component — returns HTMLHRElement with theme styles. */
  Separator: (props: SeparatorProps) => HTMLHRElement;
  /** FormGroup suite — FormGroup and FormError. */
  FormGroup: FormGroupComponents;
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
  const alertStyles = createAlert();
  const alertDialogStyles = createAlertDialogStyles();
  const accordionStyles = createAccordionStyles();
  const textareaStyles = createTextarea();
  const toastStyles = createToastStyles();
  const tooltipStyles = createTooltipStyles();

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
  };

  // Build component functions
  const components: ThemeComponents = {
    Alert: createAlertComponents(alertStyles),
    Button: createButtonComponent(buttonStyles),
    Badge: createBadgeComponent(badgeStyles),
    Card: createCardComponents(cardStyles),
    Input: createInputComponent(inputStyles),
    Textarea: createTextareaComponent(textareaStyles),
    Label: createLabelComponent(labelStyles),
    Separator: createSeparatorComponent(separatorStyles),
    FormGroup: createFormGroupComponents(formGroupStyles),
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
    },
  };

  return { theme, globals, styles, components };
}
