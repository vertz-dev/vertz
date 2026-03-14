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

// --- All components must be usable as JSX (compiles without error) ---

// Avatar (.tsx — returns JSX.Element)
void jsx(Avatar, {});

// OAuthButton (.tsx — returns JSX.Element)
void jsx(OAuthButton, { provider: 'github' });

// ProtectedRoute (.ts — returns HTMLElement via __child)
void (jsx(ProtectedRoute, { children: () => jsx('div', {}) }) satisfies HTMLElement);

// AuthGate (.ts — returns HTMLElement via __child)
void (jsx(AuthGate, { children: () => jsx('div', {}) }) satisfies HTMLElement);

// AccessGate (.ts — returns HTMLElement via __child)
void (jsx(AccessGate, { children: () => jsx('div', {}) }) satisfies HTMLElement);

// UserName (.tsx — inferred return, includes JSX.Element from static path)
void jsx(UserName, {});

// UserAvatar (.tsx — inferred return, includes JSX.Element from static path)
void jsx(UserAvatar, {});
