/**
 * Type-level tests for Context, createContext, and useContext.
 *
 * These tests verify that the generic type parameter flows correctly
 * from createContext<T> through Provider and useContext.
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */
import { createContext, useContext } from '../context';

// ─── createContext<T> — type inference ────────────────────────────
// String context
const StringCtx = createContext('default');
const _strCtx = StringCtx;
void _strCtx;
// Number context with default
const CountCtx = createContext(0);
const _numCtx = CountCtx;
void _numCtx;
const ThemeCtx = createContext({ primary: '#000', secondary: '#fff' });
const _themeCtx = ThemeCtx;
void _themeCtx;
// Context without default value (optional)
const OptionalCtx = createContext();
const _optCtx = OptionalCtx;
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
const _strVal = useContext(StringCtx);
void _strVal;
const _numVal = useContext(CountCtx);
void _numVal;
const _themeVal = useContext(ThemeCtx);
void _themeVal;
// When the value is present, it should have the correct shape
const themeValue = useContext(ThemeCtx);
if (themeValue) {
  const _primary = themeValue.primary;
  const _secondary = themeValue.secondary;
  void _primary;
  void _secondary;
}
// @ts-expect-error - useContext(Context<string>) does not return number
const _wrongType = useContext(StringCtx);
void _wrongType;
// ─── Context<T> — structural type safety ──────────────────────────
// Context<string> should not be assignable to Context<number>
// @ts-expect-error - Context<string> is not assignable to Context<number>
const _wrongCtx = StringCtx;
void _wrongCtx;
// ─── Context<T> — composing with other generics ──────────────────
// Using context with generic functions
function useThemeProperty(ctx, key) {
  const theme = useContext(ctx);
  return theme?.[key];
}
const _primaryVal = useThemeProperty(ThemeCtx, 'primary');
void _primaryVal;
// @ts-expect-error - 'invalid' is not a key of Theme
useThemeProperty(ThemeCtx, 'invalid');
const AuthCtx = createContext({ type: 'anonymous' });
AuthCtx.Provider({ type: 'logged-in', userId: '123' }, () => {});
AuthCtx.Provider({ type: 'anonymous' }, () => {});
// @ts-expect-error - 'invalid' is not a valid AuthState type discriminant
AuthCtx.Provider({ type: 'invalid' }, () => {});
const authVal = useContext(AuthCtx);
if (authVal && authVal.type === 'logged-in') {
  const _userId = authVal.userId;
  void _userId;
}
//# sourceMappingURL=context.test-d.js.map
