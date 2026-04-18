/**
 * Negative type tests for symbols removed in the drop-classname-utilities
 * migration. If any of these ever resolve, the Phase 4 deletions regressed
 * and shorthand-string helpers leaked back into the public API.
 */

// @ts-expect-error - `StyleEntry` was removed with the array-form CSS API
import type { StyleEntry } from '@vertz/ui';
export type _NoStyleEntry = StyleEntry;

// @ts-expect-error - `StyleValue` was removed with the array-form CSS API
import type { StyleValue } from '@vertz/ui';
export type _NoStyleValue = StyleValue;

// @ts-expect-error - `UtilityClass` was removed with the shorthand parser
import type { UtilityClass } from '@vertz/ui';
export type _NoUtilityClass = UtilityClass;

// @ts-expect-error - `s` (shorthand builder) was removed
import { s } from '@vertz/ui';
void s;

// @ts-expect-error - `parseShorthand` was internal; the module no longer exists
import { parseShorthand } from '@vertz/ui/css';
void parseShorthand;

// @ts-expect-error - `resolveToken` was internal; the module no longer exists
import { resolveToken } from '@vertz/ui/css';
void resolveToken;

// @ts-expect-error - `ShorthandParseError` was removed
import { ShorthandParseError } from '@vertz/ui/css';
void ShorthandParseError;

// @ts-expect-error - `TokenResolveError` was removed
import { TokenResolveError } from '@vertz/ui/css';
void TokenResolveError;

// @ts-expect-error - `InlineStyleError` was removed
import { InlineStyleError } from '@vertz/ui/css';
void InlineStyleError;

// @ts-expect-error - `isKnownProperty` was removed
import { isKnownProperty } from '@vertz/ui/css';
void isKnownProperty;

// @ts-expect-error - `isValidColorToken` was removed
import { isValidColorToken } from '@vertz/ui/css';
void isValidColorToken;
