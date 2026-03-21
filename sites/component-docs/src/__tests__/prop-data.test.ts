import { describe, expect, it } from 'bun:test';
import { accordionItemProps, accordionProps } from '../props/accordion-props';
import { alertDialogProps } from '../props/alert-dialog-props';
import { alertProps } from '../props/alert-props';
import { avatarImageProps, avatarProps } from '../props/avatar-props';
import { badgeProps } from '../props/badge-props';
import { breadcrumbProps } from '../props/breadcrumb-props';
import { buttonProps } from '../props/button-props';
import { calendarProps } from '../props/calendar-props';
import { cardProps } from '../props/card-props';
import { carouselProps } from '../props/carousel-props';
import { checkboxProps } from '../props/checkbox-props';
import { collapsibleProps } from '../props/collapsible-props';
import { commandItemProps, commandProps } from '../props/command-props';
import { contextMenuItemProps, contextMenuProps } from '../props/context-menu-props';
import { datePickerProps } from '../props/date-picker-props';
import { dialogContentProps, dialogProps } from '../props/dialog-props';
import { drawerProps } from '../props/drawer-props';
import { dropdownMenuItemProps, dropdownMenuProps } from '../props/dropdown-menu-props';
import { formErrorProps, formGroupProps } from '../props/form-group-props';
import { hoverCardProps } from '../props/hover-card-props';
import { inputProps } from '../props/input-props';
import { labelProps } from '../props/label-props';
import { menubarMenuProps, menubarProps } from '../props/menubar-props';
import { navigationMenuItemProps, navigationMenuProps } from '../props/navigation-menu-props';
import { paginationProps } from '../props/pagination-props';
import { popoverProps } from '../props/popover-props';
import { progressProps } from '../props/progress-props';
import { radioGroupItemProps, radioGroupProps } from '../props/radio-group-props';
import { resizablePanelPanelProps, resizablePanelProps } from '../props/resizable-panel-props';
import { scrollAreaProps } from '../props/scroll-area-props';
import { selectItemProps, selectProps } from '../props/select-props';
import { separatorProps } from '../props/separator-props';
import { sheetContentProps, sheetProps } from '../props/sheet-props';
import { skeletonProps } from '../props/skeleton-props';
import { sliderProps } from '../props/slider-props';
import { switchProps } from '../props/switch-props';
import { tableProps } from '../props/table-props';
import { tabsContentProps, tabsProps, tabsTriggerProps } from '../props/tabs-props';
import { textareaProps } from '../props/textarea-props';
import { toastProps } from '../props/toast-props';
import { toggleGroupItemProps, toggleGroupProps } from '../props/toggle-group-props';
import { toggleProps } from '../props/toggle-props';
import { tooltipProps } from '../props/tooltip-props';
import type { PropDefinition } from '../types';

function validateProps(name: string, props: PropDefinition[]) {
  describe(name, () => {
    it('has at least one prop', () => {
      expect(props.length).toBeGreaterThanOrEqual(1);
    });

    it('has unique prop names', () => {
      const names = props.map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('all props have non-empty fields', () => {
      for (const prop of props) {
        expect(prop.name.length).toBeGreaterThan(0);
        expect(prop.type.length).toBeGreaterThan(0);
        expect(prop.default.length).toBeGreaterThan(0);
        expect(prop.description.length).toBeGreaterThan(0);
      }
    });
  });
}

describe('Prop data files', () => {
  // Simple components
  validateProps('buttonProps', buttonProps);
  validateProps('badgeProps', badgeProps);
  validateProps('inputProps', inputProps);
  validateProps('labelProps', labelProps);
  validateProps('textareaProps', textareaProps);
  validateProps('separatorProps', separatorProps);
  validateProps('breadcrumbProps', breadcrumbProps);
  validateProps('paginationProps', paginationProps);
  // Compound / suite components
  validateProps('dialogProps', dialogProps);
  validateProps('dialogContentProps', dialogContentProps);
  validateProps('alertDialogProps', alertDialogProps);
  validateProps('selectProps', selectProps);
  validateProps('selectItemProps', selectItemProps);
  validateProps('tabsProps', tabsProps);
  validateProps('tabsTriggerProps', tabsTriggerProps);
  validateProps('tabsContentProps', tabsContentProps);
  validateProps('accordionProps', accordionProps);
  validateProps('accordionItemProps', accordionItemProps);
  validateProps('cardProps', cardProps);
  validateProps('tableProps', tableProps);
  validateProps('alertProps', alertProps);
  // Form components
  validateProps('checkboxProps', checkboxProps);
  validateProps('datePickerProps', datePickerProps);
  validateProps('formGroupProps', formGroupProps);
  validateProps('formErrorProps', formErrorProps);
  validateProps('radioGroupProps', radioGroupProps);
  validateProps('radioGroupItemProps', radioGroupItemProps);
  validateProps('sliderProps', sliderProps);
  validateProps('switchProps', switchProps);
  validateProps('toggleProps', toggleProps);
  // Layout components
  validateProps('resizablePanelProps', resizablePanelProps);
  validateProps('resizablePanelPanelProps', resizablePanelPanelProps);
  validateProps('scrollAreaProps', scrollAreaProps);
  validateProps('skeletonProps', skeletonProps);
  // Data Display components
  validateProps('avatarProps', avatarProps);
  validateProps('avatarImageProps', avatarImageProps);
  validateProps('calendarProps', calendarProps);
  validateProps('progressProps', progressProps);
  // Feedback components
  validateProps('drawerProps', drawerProps);
  validateProps('sheetProps', sheetProps);
  validateProps('sheetContentProps', sheetContentProps);
  validateProps('toastProps', toastProps);
  // Navigation components
  validateProps('commandProps', commandProps);
  validateProps('commandItemProps', commandItemProps);
  validateProps('menubarProps', menubarProps);
  validateProps('menubarMenuProps', menubarMenuProps);
  validateProps('navigationMenuProps', navigationMenuProps);
  validateProps('navigationMenuItemProps', navigationMenuItemProps);
  // Overlay components
  validateProps('contextMenuProps', contextMenuProps);
  validateProps('contextMenuItemProps', contextMenuItemProps);
  validateProps('dropdownMenuProps', dropdownMenuProps);
  validateProps('dropdownMenuItemProps', dropdownMenuItemProps);
  validateProps('hoverCardProps', hoverCardProps);
  validateProps('popoverProps', popoverProps);
  validateProps('tooltipProps', tooltipProps);
  // Disclosure components
  validateProps('carouselProps', carouselProps);
  validateProps('collapsibleProps', collapsibleProps);
  validateProps('toggleGroupProps', toggleGroupProps);
  validateProps('toggleGroupItemProps', toggleGroupItemProps);
});

describe('Button prop specifics', () => {
  it('includes intent with primary default', () => {
    const intent = buttonProps.find((p) => p.name === 'intent');
    expect(intent).toBeDefined();
    expect(intent?.default).toBe('"primary"');
  });

  it('includes size with md default', () => {
    const size = buttonProps.find((p) => p.name === 'size');
    expect(size).toBeDefined();
    expect(size?.default).toBe('"md"');
  });

  it('includes onClick handler', () => {
    const onClick = buttonProps.find((p) => p.name === 'onClick');
    expect(onClick).toBeDefined();
    expect(onClick?.type).toContain('MouseEvent');
  });
});
