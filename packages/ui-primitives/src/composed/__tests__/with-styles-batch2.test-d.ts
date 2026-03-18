/**
 * Type flow tests for Batch 2 composed primitives with withStyles().
 * Verifies ClassesOf<C> inference and key enforcement.
 */
import { ComposedCheckbox } from '../../checkbox/checkbox-composed';
import { ComposedRadioGroup } from '../../radio/radio-composed';
import { ComposedSwitch } from '../../switch/switch-composed';
import { ComposedToggle } from '../../toggle/toggle-composed';
import { withStyles } from '../with-styles';

// ── Checkbox: Positive ──

withStyles(ComposedCheckbox, { root: 'a', indicator: 'b' });

const StyledCheckbox = withStyles(ComposedCheckbox, { root: 'a', indicator: 'b' });
StyledCheckbox({ children: [] });

// ── Checkbox: Negative ──

// @ts-expect-error — missing required key 'indicator'
withStyles(ComposedCheckbox, { root: 'a' });

// @ts-expect-error — unknown key 'extra'
withStyles(ComposedCheckbox, { root: 'a', indicator: 'b', extra: 'c' });

// ── Switch: Positive ──

withStyles(ComposedSwitch, { root: 'a', thumb: 'b' });

const StyledSwitch = withStyles(ComposedSwitch, { root: 'a', thumb: 'b' });
StyledSwitch({ children: [] });

// ── Switch: Negative ──

// @ts-expect-error — missing required key 'thumb'
withStyles(ComposedSwitch, { root: 'a' });

// @ts-expect-error — unknown key 'indicator' (that's Checkbox, not Switch)
withStyles(ComposedSwitch, { root: 'a', thumb: 'b', indicator: 'c' });

// ── Toggle: Positive ──

withStyles(ComposedToggle, { root: 'a' });

const StyledToggle = withStyles(ComposedToggle, { root: 'a' });
StyledToggle({ children: [] });

// ── Toggle: Negative ──

// @ts-expect-error — unknown key 'thumb' (that's Switch, not Toggle)
withStyles(ComposedToggle, { root: 'a', thumb: 'b' });

// ── Cross-component: class keys don't mix ──

// @ts-expect-error — Checkbox keys on Switch
withStyles(ComposedSwitch, { root: 'a', indicator: 'b' });

// @ts-expect-error — Switch keys on Checkbox
withStyles(ComposedCheckbox, { root: 'a', thumb: 'b' });

// ── RadioGroup: Positive ──

withStyles(ComposedRadioGroup, { root: 'a', item: 'b', indicator: 'c', indicatorIcon: 'd' });

const StyledRadioGroup = withStyles(ComposedRadioGroup, {
  root: 'a',
  item: 'b',
  indicator: 'c',
  indicatorIcon: 'd',
});
StyledRadioGroup({ children: [] });
// Sub-component preserved on styled result
StyledRadioGroup.Item({ value: 'opt1', children: [] });

// ── RadioGroup: Negative ──

// @ts-expect-error — missing required keys
withStyles(ComposedRadioGroup, { root: 'a' });

// @ts-expect-error — unknown key 'thumb' on RadioGroup
withStyles(ComposedRadioGroup, { root: 'a', item: 'b', indicator: 'c', thumb: 'd' });
