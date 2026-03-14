// Type tests for ui-auth components — compile-time assertions
// These should compile without errors if return types satisfy JSX.Element

import { jsx } from '@vertz/ui/jsx-runtime';
import { AccessGate } from '../access-gate';
import { AuthGate } from '../auth-gate';
import { Avatar } from '../avatar';
import { OAuthButton } from '../oauth-button';
import { ProtectedRoute } from '../protected-route';
import { UserAvatar } from '../user-avatar';
import { UserName } from '../user-name';

// --- Category A: Simple return type narrowing ---

// Avatar returns JSX.Element (HTMLElement via JSX)
void (jsx(Avatar, {}) satisfies HTMLElement);

// OAuthButton returns JSX.Element (HTMLElement via JSX)
void (jsx(OAuthButton, { provider: 'github' }) satisfies HTMLElement);

// --- Category B: Signal-returning → __child() refactoring ---

// ProtectedRoute returns HTMLElement
void (jsx(ProtectedRoute, { children: () => jsx('div', {}) }) satisfies HTMLElement);

// AuthGate returns HTMLElement
void (jsx(AuthGate, { children: () => jsx('div', {}) }) satisfies HTMLElement);

// AccessGate returns HTMLElement
void (jsx(AccessGate, { children: () => jsx('div', {}) }) satisfies HTMLElement);

// UserName returns HTMLElement
void (jsx(UserName, {}) satisfies HTMLElement);

// UserAvatar returns HTMLElement
void (jsx(UserAvatar, {}) satisfies HTMLElement);
