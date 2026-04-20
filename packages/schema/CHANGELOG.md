# @vertz/schema

## 0.2.76

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.76

## 0.2.75

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.75

## 0.2.74

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.74

## 0.2.73

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.73

## 0.2.72

### Patch Changes

- [#2810](https://github.com/vertz-dev/vertz/pull/2810) [`8d8976d`](https://github.com/vertz-dev/vertz/commit/8d8976dd3d2d2475f37d0df79f8477fd3f58395f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui,schema): coerce FormData to schema-declared types in `form()` (#2771)

  `form()` now coerces FormData values to match the body schema's declared types
  before validation and submission.

  - Boolean fields: checked → `true`; unchecked → `false`; `value="false"`/`"0"`/`"off"` → `false`.
  - Number/BigInt fields: numeric strings → numbers; empty strings dropped (let `optional()`/`default()` apply).
  - Date fields: parseable strings → `Date`.
  - String fields: never coerced, even if the value looks numeric.
  - Multi-value fields: `<input type="checkbox" name="tags" value="..." />` produces `string[]`.
  - The same coercion is applied to blur/change re-validation so live and submit
    errors agree.

  Behavior change: (1) Custom `onSubmit` handlers that pre-coerce values should
  remove that logic to avoid double-coercion. (2) User schemas that switched
  fields to `s.coerce.boolean()` / `s.coerce.number()` as a workaround should
  revert to strict `s.boolean()` / `s.number()` — the UI layer now handles the
  conversion.

  Adds two additive accessors to `@vertz/schema`:

  - `ArraySchema.element` — public getter for the element schema (previously
    `_element` was private).
  - `RefinedSchema.unwrap()` / `SuperRefinedSchema.unwrap()` — return the inner
    schema, so consumers (including the new form coercion path) can walk through
    `.refine()` / `.superRefine()` wrappers to reach the underlying object shape.

- Updated dependencies []:
  - @vertz/errors@0.2.72

## 0.2.71

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.71

## 0.2.70

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.70

## 0.2.69

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.69

## 0.2.68

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.68

## 0.2.67

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.67

## 0.2.66

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.66

## 0.2.65

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.65

## 0.2.64

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.64

## 0.2.63

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.63

## 0.2.62

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.62

## 0.2.61

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.61

## 0.2.60

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.60

## 0.2.59

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.59

## 0.2.58

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.58

## 0.2.57

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.57

## 0.2.56

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.56

## 0.2.55

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.55

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.51

## 0.2.50

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.49

## 0.2.48

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.47

## 0.2.46

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.43

## 0.2.42

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.41

## 0.2.40

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.39

## 0.2.38

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.25

## 0.2.24

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.24

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.22

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.14

## 0.2.13

### Patch Changes

- Updated dependencies [[`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344)]:
  - @vertz/errors@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.5

## 0.2.4

## 0.2.3

## 0.2.2

### Patch Changes

- [#861](https://github.com/vertz-dev/vertz/pull/861) [`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: address second-pass security audit findings — hidden field stripping in action pipeline, CSS value sanitization, empty string coercion guard

## 0.2.0

### Minor Changes

- [#295](https://github.com/vertz-dev/vertz/pull/295) [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06) Thanks [@vertz-dev-dx](https://github.com/apps/vertz-dev-dx)! - Add `s.fromDbEnum()` to create validation schemas directly from `@vertz/db` enum columns, eliminating value duplication between database and validation layers.

### Patch Changes

- [#200](https://github.com/vertz-dev/vertz/pull/200) [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Published types now correctly preserve generic type parameters in `.d.ts` files. Switched DTS bundler to use `inferTypes` mode, preventing potential erasure of generics to `Record<string, unknown>` or `unknown` in the emitted declarations.

- [#193](https://github.com/vertz-dev/vertz/pull/193) [`6443339`](https://github.com/vertz-dev/vertz/commit/64433394142ddff76d8021b25259c9c901d62b1e) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Format schemas (email, uuid, url, etc.) now inherit string methods like `.trim()`, `.toLowerCase()`, `.min()`, `.max()`. Previously chaining these methods on format schemas lost the specific type.
