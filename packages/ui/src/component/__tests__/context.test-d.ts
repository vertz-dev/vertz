/**
 * Type-level tests for Context, createContext, and useContext.
 *
 * These tests verify that the generic type parameter flows correctly
 * from createContext<T> through Provider and useContext.
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { Context } from '../context';
import { createContext, useContext } from '../context';

// ─── createContext<T> — type inference ────────────────────────────

// String context
const StringCtx = createContext<string>('default');
const _strCtx: Context<string> = StringCtx;
void _strCtx;

// Number context with default
const CountCtx = createContext<number>(0);
const _numCtx: Context<number> = CountCtx;
void _numCtx;

// Complex type context
interface Theme {
  primary: string;
  secondary: string;
}

const ThemeCtx = createContext<Theme>({ primary: '#000', secondary: '#fff' });
const _themeCtx: Context<Theme> = ThemeCtx;
void _themeCtx;

// Context without default value (optional)
const OptionalCtx = createContext<string>();
const _optCtx: Context<string> = OptionalCtx;
void _optCtx;

// ─── Context<T>.Provider — value type safety ──────────────────────

// Provider accepts the correct type
StringCtx.Provider('hello', () => {});
CountCtx.Provider(42, () => {});
ThemeCtx.Provider({ primary: 'red', secondary: 'blue' }, () => {});

// @ts-expect-error - number is not assignable to string
StringCtx.Provider(123, () => {});

// @ts-expect-error - string is not assignable to number
CountCtx.Provider('not a number', () => {});

// @ts-expect-error - missing required property 'secondary'
ThemeCtx.Provider({ primary: 'red' }, () => {});

// ─── useContext<T> — return type ──────────────────────────────────

// useContext returns T | undefined
const _strVal: string | undefined = useContext(StringCtx);
void _strVal;

const _numVal: number | undefined = useContext(CountCtx);
void _numVal;

const _themeVal: Theme | undefined = useContext(ThemeCtx);
void _themeVal;

// When the value is present, it should have the correct shape
const themeValue = useContext(ThemeCtx);
if (themeValue) {
  const _primary: string = themeValue.primary;
  const _secondary: string = themeValue.secondary;
  void _primary;
  void _secondary;
}

// @ts-expect-error - useContext(Context<string>) does not return number
const _wrongType: number = useContext(StringCtx);
void _wrongType;

// ─── Context<T> — structural type safety ──────────────────────────

// Context<string> should not be assignable to Context<number>
// @ts-expect-error - Context<string> is not assignable to Context<number>
const _wrongCtx: Context<number> = StringCtx;
void _wrongCtx;

// ─── Context<T> — composing with other generics ──────────────────

// Using context with generic functions
function useThemeProperty<K extends keyof Theme>(
  ctx: Context<Theme>,
  key: K,
): Theme[K] | undefined {
  const theme = useContext(ctx);
  return theme?.[key];
}

const _primaryVal: string | undefined = useThemeProperty(ThemeCtx, 'primary');
void _primaryVal;

// @ts-expect-error - 'invalid' is not a key of Theme
useThemeProperty(ThemeCtx, 'invalid');

// ─── Context<T> — union types ─────────────────────────────────────

type AuthState = { type: 'logged-in'; userId: string } | { type: 'anonymous' };

const AuthCtx = createContext<AuthState>({ type: 'anonymous' });

AuthCtx.Provider({ type: 'logged-in', userId: '123' }, () => {});
AuthCtx.Provider({ type: 'anonymous' }, () => {});

// @ts-expect-error - 'invalid' is not a valid AuthState type discriminant
AuthCtx.Provider({ type: 'invalid' }, () => {});

const authVal = useContext(AuthCtx);
if (authVal && authVal.type === 'logged-in') {
  const _userId: string = authVal.userId;
  void _userId;
}

// ─── Context<T>.Provider — JSX overload type safety ─────────────

// JSX pattern accepts correct shape
StringCtx.Provider({ value: 'hello', children: () => null });

// @ts-expect-error - missing 'value' key in JSX props
StringCtx.Provider({ children: () => null });

// @ts-expect-error - wrong type for value in JSX props
StringCtx.Provider({ value: 123, children: () => null });

// ─── UnwrapSignals<T> — context auto-unwrap ──────────────────────

import type { Signal } from '../../runtime/signal-types';
import type { UnwrapSignals } from '../context';

// Context with signal properties should auto-unwrap
interface SettingsContext {
  theme: Signal<string>;
  setTheme: (t: string) => void;
}

const SettingsCtx = createContext<SettingsContext>();
const settings = useContext(SettingsCtx);

if (settings) {
  // Positive: theme should be string (unwrapped from Signal<string>)
  const _theme: string = settings.theme;
  void _theme;

  // Positive: setTheme should remain a function
  const _setTheme: (t: string) => void = settings.setTheme;
  void _setTheme;

  // @ts-expect-error - theme is string, not Signal<string>, so .peek() doesn't exist
  settings.theme.peek();

  // @ts-expect-error - theme is string, not Signal<string>, so .value doesn't exist
  settings.theme.value;
}

// UnwrapSignals on primitives passes through
type _CheckPrimString = UnwrapSignals<string>;
const _primStr: _CheckPrimString = 'hello';
void _primStr;

// UnwrapSignals on plain object leaves it unchanged
type _CheckPlainObj = UnwrapSignals<{ name: string; count: number }>;
const _plainObj: _CheckPlainObj = { name: 'test', count: 42 };
void _plainObj;
