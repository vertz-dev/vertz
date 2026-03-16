/**
 * Type flow tests for withStyles() generics.
 * Verifies ClassesOf<C> inference and key enforcement per component.
 */
import { ComposedAccordion } from '../../accordion/accordion-composed';
import { ComposedAlertDialog } from '../../alert-dialog/alert-dialog-composed';
import { ComposedDialog } from '../../dialog/dialog-composed';
import { ComposedDropdownMenu } from '../../dropdown-menu/dropdown-menu-composed';
import { ComposedSelect } from '../../select/select-composed';
import { ComposedTabs } from '../../tabs/tabs-composed';
import { withStyles } from '../with-styles';

// ── Positive: correct class maps compile ──

withStyles(ComposedDialog, {
  overlay: 'a',
  content: 'b',
  close: 'c',
  header: 'd',
  title: 'e',
  description: 'f',
  footer: 'g',
});

withStyles(ComposedAlertDialog, {
  overlay: 'a',
  content: 'b',
  cancel: 'c',
  action: 'd',
  header: 'e',
  title: 'f',
  description: 'g',
  footer: 'h',
});

// ── Negative: unknown class key rejected ──

// @ts-expect-error — missing required keys + unknown key 'bogus'
withStyles(ComposedDialog, { bogus: 'x' });

// Extra key 'cancel' on Dialog is rejected (that's an AlertDialog key)
withStyles(ComposedDialog, {
  overlay: 'a',
  content: 'b',
  close: 'c',
  header: 'd',
  title: 'e',
  description: 'f',
  footer: 'g',
  // @ts-expect-error — 'cancel' does not exist on Dialog class keys
  cancel: 'h',
});

// ── Negative: missing required keys rejected ──

// @ts-expect-error — missing required keys (only overlay provided)
withStyles(ComposedDialog, { overlay: 'a' });

// @ts-expect-error — missing required keys (only overlay provided for AlertDialog)
withStyles(ComposedAlertDialog, { overlay: 'a' });

// ── Negative: Dialog keys don't work on AlertDialog ──

// 'close' is a Dialog key, not AlertDialog — rejected
withStyles(ComposedAlertDialog, {
  overlay: 'a',
  content: 'b',
  // @ts-expect-error — 'close' does not exist on AlertDialog class keys
  close: 'c',
  header: 'd',
  title: 'e',
  description: 'f',
  footer: 'g',
});

// ── Positive: styled component preserves sub-component properties ──

const StyledDialog = withStyles(ComposedDialog, {
  overlay: 'a',
  content: 'b',
  close: 'c',
  header: 'd',
  title: 'e',
  description: 'f',
  footer: 'g',
});

// Sub-components should be accessible
StyledDialog.Trigger({ children: [] });
StyledDialog.Content({ children: [] });
StyledDialog.Title({ children: [] });
StyledDialog.Description({ children: [] });
StyledDialog.Header({ children: [] });
StyledDialog.Footer({ children: [] });
StyledDialog.Close({ children: [] });

// Styled component should be callable without classes prop
StyledDialog({ children: [] });

// ── Positive: Tabs class keys compile ──

withStyles(ComposedTabs, {
  list: 'a',
  trigger: 'b',
  panel: 'c',
});

// @ts-expect-error — missing required keys for Tabs
withStyles(ComposedTabs, { list: 'a' });

// @ts-expect-error — 'overlay' is not a Tabs key
withStyles(ComposedTabs, { list: 'a', trigger: 'b', panel: 'c', overlay: 'd' });

// ── Positive: Accordion class keys compile ──

withStyles(ComposedAccordion, {
  item: 'a',
  trigger: 'b',
  content: 'c',
});

// @ts-expect-error — missing required keys for Accordion
withStyles(ComposedAccordion, { item: 'a' });

// ── Positive: Select class keys compile ──

withStyles(ComposedSelect, {
  trigger: 'a',
  content: 'b',
  item: 'c',
  itemIndicator: 'd',
  group: 'e',
  separator: 'f',
});

// @ts-expect-error — missing required keys for Select
withStyles(ComposedSelect, { trigger: 'a' });

// ── Positive: styled Tabs preserves sub-components ──

const StyledTabs = withStyles(ComposedTabs, {
  list: 'a',
  trigger: 'b',
  panel: 'c',
});

StyledTabs.List({ children: [] });
StyledTabs.Trigger({ value: 'tab1', children: [] });
StyledTabs.Content({ value: 'tab1', children: [] });
StyledTabs({ children: [] });

// ── Positive: DropdownMenu class keys compile ──

withStyles(ComposedDropdownMenu, {
  content: 'a',
  item: 'b',
  group: 'c',
  label: 'd',
  separator: 'e',
});

// Extra key 'trigger' on DropdownMenu is rejected (trigger is not a class key)
withStyles(ComposedDropdownMenu, {
  content: 'a',
  item: 'b',
  group: 'c',
  label: 'd',
  separator: 'e',
  // @ts-expect-error — 'trigger' does not exist on DropdownMenu class keys
  trigger: 'f',
});
