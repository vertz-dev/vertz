# @vertz/schema

## 0.2.78

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.78

## 0.2.77

### Patch Changes

- [#2925](https://github.com/vertz-dev/vertz/pull/2925) [`b7500f9`](https://github.com/vertz-dev/vertz/commit/b7500f9489d7bb65260ec7fff5f95b3fd4d95925) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(schema): user-friendly invalid-type messages for `s.number()` / `s.bigint()` / `s.date()`

  Closes [#2809](https://github.com/vertz-dev/vertz/issues/2809).

  The form-data coercion layer (`coerceLeaf` in `@vertz/ui`) deliberately passes non-numeric / unparseable strings through to the schema unchanged so the schema's own validator owns the error message. That rested on the schema producing something end-user-readable, which it didn't — `s.number().parse('42a')` produced `"Expected number, received string"`, which is technically accurate but useless in a form field. `#2771` made FormData coercion implicit (users write `s.number()`, not `s.coerce.number()`), which put these messages directly in front of end users.

  The default messages are now:

  - `s.number()` → `"Must be a number"` (covers non-number values, NaN, and pass-through strings like `"42a"`)
  - `s.bigint()` → `"Must be an integer"`
  - `s.date()` → `"Must be a valid date"` (covers non-Date values and invalid `Date` objects with `NaN` time)

  Each schema also gets a `.message(msg)` chainable method so apps can localise or customise:

  ```ts
  s.number().message("Age must be a number");
  s.date().message("Pick a valid date").min(new Date("2024-01-01"));
  ```

  The custom message is preserved across clones (e.g. after `.gte()`, `.min()`).

- [#2928](https://github.com/vertz-dev/vertz/pull/2928) [`9819901`](https://github.com/vertz-dev/vertz/commit/9819901b97226bbdffb090a7261ee2e3828d163c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): coerce form-encoded bodies on the server using the route schema

  Closes [#2808](https://github.com/vertz-dev/vertz/issues/2808).

  `coerceFormDataToSchema` and `coerceLeaf` now live in `@vertz/schema` so the same kernel that powers client-side `form()` coercion (#2771) runs on the server. `parseBody` in `@vertz/core` accepts an optional `coerceSchema` and now handles `multipart/form-data` in addition to `application/x-www-form-urlencoded`; entity and service route generators populate `coerceSchema` from the route's expected input shape.

  End result: the same entity works across three submit modes without validation drift.

  ```ts
  // Entity
  d.table("tasks", {
    id: d.uuid().primary(),
    title: d.text(),
    done: d.boolean().default(false),
  });

  // 1. JS form() path — already coerced on the client, sent as JSON
  fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "buy milk", done: true }),
  });

  // 2. Progressive-enhancement no-JS submit — browser sends urlencoded strings
  // <form method="post" action="/api/tasks">...</form>
  // body: title=buy+milk&done=on

  // 3. curl / agent — urlencoded with a different boolean spelling
  // curl -X POST /api/tasks --data-urlencode 'title=buy milk' --data-urlencode 'done=true'
  ```

  All three hit the handler with `{ title: 'buy milk', done: true }`. Previously modes 2 and 3 failed schema validation because checkboxes and numeric inputs arrived as strings. The coercion step runs before the CRUD pipeline's strict validation, so `EntityValidationError` semantics are unchanged when a body is actually malformed.

  The new `coerceSchema` field on `EntityRouteEntry` is separate from `bodySchema` on purpose — it coerces without enforcing app-runner-level validation, which lets entity routes keep their existing error format.

- Updated dependencies []:
  - @vertz/errors@0.2.77

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
