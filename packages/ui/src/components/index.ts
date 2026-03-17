/**
 * Centralized theme component exports.
 *
 * Import themed components from this module instead of directly from a theme package.
 * Components are typed via module augmentation — install a theme package
 * (e.g., `@vertz/theme-shadcn`) for full type safety.
 *
 * @example
 * ```ts
 * // theme.ts — register once at app startup
 * import { registerTheme } from '@vertz/ui';
 * import { configureTheme } from '@vertz/theme-shadcn';
 * registerTheme(configureTheme({ palette: 'zinc', radius: 'md' }));
 *
 * // any-component.tsx — import components
 * import { Button, Dialog, Card } from '@vertz/ui/components';
 * ```
 */
export type { ThemeComponentMap } from './types';

import { _getComponent, _getPrimitive } from '../theme/registry';
import type { ThemeComponentMap } from './types';

// ---------------------------------------------------------------------------
// Proxy factories
// ---------------------------------------------------------------------------

/** Creates a proxy function for a direct component (Button, Input, etc.). */
function createComponentProxy(name: string): unknown {
  return (...args: unknown[]) => {
    const fn = _getComponent(name);
    if (typeof fn !== 'function') {
      throw new Error(
        `Component "${name}" is not a function in the registered theme. ` +
          `Check that your theme package provides this component.`,
      );
    }
    return (fn as (...a: unknown[]) => unknown)(...args);
  };
}

/** Creates a proxy object for a suite component (Card, Alert, etc.). */
function createSuiteProxy(name: string, subComponents: readonly string[]): unknown {
  const suite: Record<string, unknown> = {};
  for (const sub of subComponents) {
    Object.defineProperty(suite, sub, {
      get: () => {
        const parent = _getComponent(name);
        return Reflect.get(parent as object, sub);
      },
      enumerable: true,
      configurable: true,
    });
  }
  return suite;
}

/** Creates a callable proxy with sub-component getters for primitives (Dialog, Select, etc.). */
function createCompoundProxy(name: string, subComponents: readonly string[]): unknown {
  const root = (...args: unknown[]) => {
    const fn = _getPrimitive(name);
    if (typeof fn !== 'function') {
      throw new Error(
        `Primitive "${name}" is not callable in the registered theme. ` +
          `Check that your theme package provides this component.`,
      );
    }
    return (fn as (...a: unknown[]) => unknown)(...args);
  };
  for (const sub of subComponents) {
    Object.defineProperty(root, sub, {
      get: () => {
        const parent = _getPrimitive(name);
        return Reflect.get(parent as object, sub);
      },
      enumerable: true,
      configurable: true,
    });
  }
  return root;
}

/** Creates a proxy function for a simple primitive (Checkbox, Switch, etc.). */
function createPrimitiveProxy(name: string): unknown {
  return (...args: unknown[]) => {
    const fn = _getPrimitive(name);
    if (typeof fn !== 'function') {
      throw new Error(
        `Primitive "${name}" is not a function in the registered theme. ` +
          `Check that your theme package provides this component.`,
      );
    }
    return (fn as (...a: unknown[]) => unknown)(...args);
  };
}

// ---------------------------------------------------------------------------
// Direct components
// ---------------------------------------------------------------------------

export const Button: ThemeComponentMap['Button'] = /* #__PURE__ */ createComponentProxy(
  'Button',
) as ThemeComponentMap['Button'];

export const Badge: ThemeComponentMap['Badge'] = /* #__PURE__ */ createComponentProxy(
  'Badge',
) as ThemeComponentMap['Badge'];

export const Input: ThemeComponentMap['Input'] = /* #__PURE__ */ createComponentProxy(
  'Input',
) as ThemeComponentMap['Input'];

export const Textarea: ThemeComponentMap['Textarea'] = /* #__PURE__ */ createComponentProxy(
  'Textarea',
) as ThemeComponentMap['Textarea'];

export const Label: ThemeComponentMap['Label'] = /* #__PURE__ */ createComponentProxy(
  'Label',
) as ThemeComponentMap['Label'];

export const Separator: ThemeComponentMap['Separator'] = /* #__PURE__ */ createComponentProxy(
  'Separator',
) as ThemeComponentMap['Separator'];

export const Breadcrumb: ThemeComponentMap['Breadcrumb'] = /* #__PURE__ */ createComponentProxy(
  'Breadcrumb',
) as ThemeComponentMap['Breadcrumb'];

export const Pagination: ThemeComponentMap['Pagination'] = /* #__PURE__ */ createComponentProxy(
  'Pagination',
) as ThemeComponentMap['Pagination'];

// ---------------------------------------------------------------------------
// Suite components (object with sub-component getters)
// ---------------------------------------------------------------------------

export const Alert: ThemeComponentMap['Alert'] = /* #__PURE__ */ createSuiteProxy('Alert', [
  'Alert',
  'AlertTitle',
  'AlertDescription',
]) as ThemeComponentMap['Alert'];

export const Card: ThemeComponentMap['Card'] = /* #__PURE__ */ createSuiteProxy('Card', [
  'Card',
  'CardHeader',
  'CardTitle',
  'CardDescription',
  'CardContent',
  'CardFooter',
  'CardAction',
]) as ThemeComponentMap['Card'];

export const FormGroup: ThemeComponentMap['FormGroup'] = /* #__PURE__ */ createSuiteProxy(
  'FormGroup',
  ['FormGroup', 'FormError'],
) as ThemeComponentMap['FormGroup'];

export const Avatar: ThemeComponentMap['Avatar'] = /* #__PURE__ */ createSuiteProxy('Avatar', [
  'Avatar',
  'AvatarImage',
  'AvatarFallback',
]) as ThemeComponentMap['Avatar'];

export const Skeleton: ThemeComponentMap['Skeleton'] = /* #__PURE__ */ createSuiteProxy(
  'Skeleton',
  ['Skeleton'],
) as ThemeComponentMap['Skeleton'];

export const Table: ThemeComponentMap['Table'] = /* #__PURE__ */ createSuiteProxy('Table', [
  'Table',
  'TableHeader',
  'TableBody',
  'TableRow',
  'TableHead',
  'TableCell',
  'TableCaption',
  'TableFooter',
]) as ThemeComponentMap['Table'];

// ---------------------------------------------------------------------------
// Compound primitives (callable + sub-component getters)
// ---------------------------------------------------------------------------

export const AlertDialog: ThemeComponentMap['AlertDialog'] = /* #__PURE__ */ createCompoundProxy(
  'AlertDialog',
  ['Trigger', 'Content', 'Header', 'Title', 'Description', 'Footer', 'Cancel', 'Action'],
) as ThemeComponentMap['AlertDialog'];

export const Dialog: ThemeComponentMap['Dialog'] = /* #__PURE__ */ createCompoundProxy('Dialog', [
  'Trigger',
  'Content',
  'Header',
  'Title',
  'Description',
  'Footer',
  'Close',
]) as ThemeComponentMap['Dialog'];

export const DropdownMenu: ThemeComponentMap['DropdownMenu'] = /* #__PURE__ */ createCompoundProxy(
  'DropdownMenu',
  ['Trigger', 'Content', 'Item', 'Group', 'Label', 'Separator'],
) as ThemeComponentMap['DropdownMenu'];

export const Select: ThemeComponentMap['Select'] = /* #__PURE__ */ createCompoundProxy('Select', [
  'Trigger',
  'Content',
  'Item',
  'Group',
  'Separator',
]) as ThemeComponentMap['Select'];

export const Tabs: ThemeComponentMap['Tabs'] = /* #__PURE__ */ createCompoundProxy('Tabs', [
  'List',
  'Trigger',
  'Content',
]) as ThemeComponentMap['Tabs'];

export const Popover: ThemeComponentMap['Popover'] = /* #__PURE__ */ createCompoundProxy(
  'Popover',
  ['Trigger', 'Content'],
) as ThemeComponentMap['Popover'];

export const RadioGroup: ThemeComponentMap['RadioGroup'] = /* #__PURE__ */ createCompoundProxy(
  'RadioGroup',
  ['Item'],
) as ThemeComponentMap['RadioGroup'];

export const Accordion: ThemeComponentMap['Accordion'] = /* #__PURE__ */ createCompoundProxy(
  'Accordion',
  ['Item', 'Trigger', 'Content'],
) as ThemeComponentMap['Accordion'];

export const Tooltip: ThemeComponentMap['Tooltip'] = /* #__PURE__ */ createCompoundProxy(
  'Tooltip',
  ['Trigger', 'Content'],
) as ThemeComponentMap['Tooltip'];

export const Sheet: ThemeComponentMap['Sheet'] = /* #__PURE__ */ createCompoundProxy('Sheet', [
  'Trigger',
  'Content',
  'Title',
  'Description',
  'Close',
]) as ThemeComponentMap['Sheet'];

export const Drawer: ThemeComponentMap['Drawer'] = /* #__PURE__ */ createCompoundProxy('Drawer', [
  'Trigger',
  'Content',
  'Header',
  'Title',
  'Description',
  'Footer',
  'Handle',
]) as ThemeComponentMap['Drawer'];

// ---------------------------------------------------------------------------
// Simple primitives (just callable, no sub-components)
// ---------------------------------------------------------------------------

export const Calendar: ThemeComponentMap['Calendar'] = /* #__PURE__ */ createPrimitiveProxy(
  'Calendar',
) as ThemeComponentMap['Calendar'];

export const Checkbox: ThemeComponentMap['Checkbox'] = /* #__PURE__ */ createPrimitiveProxy(
  'Checkbox',
) as ThemeComponentMap['Checkbox'];

export const Switch: ThemeComponentMap['Switch'] = /* #__PURE__ */ createPrimitiveProxy(
  'Switch',
) as ThemeComponentMap['Switch'];

export const Progress: ThemeComponentMap['Progress'] = /* #__PURE__ */ createPrimitiveProxy(
  'Progress',
) as ThemeComponentMap['Progress'];

export const Slider: ThemeComponentMap['Slider'] = /* #__PURE__ */ createPrimitiveProxy(
  'Slider',
) as ThemeComponentMap['Slider'];

export const Toggle: ThemeComponentMap['Toggle'] = /* #__PURE__ */ createPrimitiveProxy(
  'Toggle',
) as ThemeComponentMap['Toggle'];

export const Toast: ThemeComponentMap['Toast'] = /* #__PURE__ */ createPrimitiveProxy(
  'Toast',
) as ThemeComponentMap['Toast'];

// ---------------------------------------------------------------------------
// Factory primitives (lowercase names, delegated directly)
// ---------------------------------------------------------------------------

export const carousel: ThemeComponentMap['carousel'] = /* #__PURE__ */ createPrimitiveProxy(
  'carousel',
) as ThemeComponentMap['carousel'];

export const collapsible: ThemeComponentMap['collapsible'] = /* #__PURE__ */ createPrimitiveProxy(
  'collapsible',
) as ThemeComponentMap['collapsible'];

export const command: ThemeComponentMap['command'] = /* #__PURE__ */ createPrimitiveProxy(
  'command',
) as ThemeComponentMap['command'];

export const contextMenu: ThemeComponentMap['contextMenu'] = /* #__PURE__ */ createPrimitiveProxy(
  'contextMenu',
) as ThemeComponentMap['contextMenu'];

export const datePicker: ThemeComponentMap['datePicker'] = /* #__PURE__ */ createPrimitiveProxy(
  'datePicker',
) as ThemeComponentMap['datePicker'];

export const hoverCard: ThemeComponentMap['hoverCard'] = /* #__PURE__ */ createPrimitiveProxy(
  'hoverCard',
) as ThemeComponentMap['hoverCard'];

export const menubar: ThemeComponentMap['menubar'] = /* #__PURE__ */ createPrimitiveProxy(
  'menubar',
) as ThemeComponentMap['menubar'];

export const navigationMenu: ThemeComponentMap['navigationMenu'] =
  /* #__PURE__ */ createPrimitiveProxy('navigationMenu') as ThemeComponentMap['navigationMenu'];

export const resizablePanel: ThemeComponentMap['resizablePanel'] =
  /* #__PURE__ */ createPrimitiveProxy('resizablePanel') as ThemeComponentMap['resizablePanel'];

export const scrollArea: ThemeComponentMap['scrollArea'] = /* #__PURE__ */ createPrimitiveProxy(
  'scrollArea',
) as ThemeComponentMap['scrollArea'];

export const toggleGroup: ThemeComponentMap['toggleGroup'] = /* #__PURE__ */ createPrimitiveProxy(
  'toggleGroup',
) as ThemeComponentMap['toggleGroup'];
