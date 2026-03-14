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

// ProtectedRoute (.tsx — returns JSX.Element)
void jsx(ProtectedRoute, { children: () => jsx('div', {}) });

// AuthGate (.tsx — returns JSX.Element)
void jsx(AuthGate, { children: () => jsx('div', {}) });

// AccessGate (.tsx — returns JSX.Element)
void jsx(AccessGate, { children: () => jsx('div', {}) });

// UserName (.tsx — returns JSX.Element)
void jsx(UserName, {});

// UserAvatar (.tsx — returns JSX.Element)
void jsx(UserAvatar, {});
