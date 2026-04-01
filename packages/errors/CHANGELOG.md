# @vertz/errors

## 0.2.43

## 0.2.42

## 0.2.41

## 0.2.40

## 0.2.39

## 0.2.38

## 0.2.37

## 0.2.36

## 0.2.35

## 0.2.34

## 0.2.33

## 0.2.32

## 0.2.31

## 0.2.30

## 0.2.29

## 0.2.28

## 0.2.27

## 0.2.26

## 0.2.25

## 0.2.24

## 0.2.23

## 0.2.22

## 0.2.21

## 0.2.20

## 0.2.19

## 0.2.18

## 0.2.17

## 0.2.16

## 0.2.15

## 0.2.14

## 0.2.13

### Patch Changes

- [#1040](https://github.com/vertz-dev/vertz/pull/1040) [`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add email verification and password reset flows to auth module.

  - Email verification: opt-in via `emailVerification` config, sends token on signup via `onSend` callback
  - POST /api/auth/verify-email — validates token, marks emailVerified: true
  - POST /api/auth/resend-verification — rate limited 3/hour per userId
  - Password reset: opt-in via `passwordReset` config with `onSend` callback
  - POST /api/auth/forgot-password — always returns 200 (prevents email enumeration)
  - POST /api/auth/reset-password — validates token, updates password, revokes sessions
  - New error types: TokenExpiredError, TokenInvalidError
  - New stores: InMemoryEmailVerificationStore, InMemoryPasswordResetStore

- [#1037](https://github.com/vertz-dev/vertz/pull/1037) [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add MFA/TOTP support with backup codes and step-up authentication.

  - TOTP (RFC 6238) generation and verification
  - MFA setup, verify, disable, and backup code routes
  - MFA challenge flow: signIn returns MFA_REQUIRED when MFA is enabled
  - Step-up authentication with `fva` (factor verification age) JWT claim
  - `checkFva()` utility for protecting sensitive operations
  - `InMemoryMFAStore` for development/testing
  - New MFA error types: MFA_REQUIRED, MFA_INVALID_CODE, MFA_ALREADY_ENABLED, MFA_NOT_ENABLED

- [#1034](https://github.com/vertz-dev/vertz/pull/1034) [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add OAuth provider support (Google, GitHub, Discord) with PKCE, encrypted state cookies, and automatic account linking.

## 0.2.12

## 0.2.11

## 0.2.8

## 0.2.7

## 0.2.6

## 0.2.5
