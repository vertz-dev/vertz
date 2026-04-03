# @vertz/create-vertz-app

## 0.2.46

## 0.2.45

## 0.2.44

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

### Patch Changes

- [#1734](https://github.com/vertz-dev/vertz/pull/1734) [`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated `ListTransition` component — use `<List animate>` instead

  `ListTransition` and `ListTransitionProps` are no longer exported from `@vertz/ui`. Use `<List animate>` from `@vertz/ui/components`:

  ```tsx
  // Before
  import { ListTransition } from "@vertz/ui";

  <ListTransition
    each={items}
    keyFn={(item) => item.id}
    children={(item) => <TodoItem task={item} />}
  />;

  // After
  import { List } from "@vertz/ui/components";

  <List animate>
    {items.map((item) => (
      <List.Item key={item.id}>
        <TodoItem task={item} />
      </List.Item>
    ))}
  </List>;
  ```

- [#1732](https://github.com/vertz-dev/vertz/pull/1732) [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `queryMatch` primitive — use direct conditional rendering instead

  `queryMatch()` has been removed. Replace with direct conditionals on query signal properties:

  ```tsx
  // Before
  {
    queryMatch(tasks, {
      loading: () => <Spinner />,
      error: (err) => <Error error={err} />,
      data: (data) => <List items={data.items} />,
    });
  }

  // After
  {
    tasks.loading && <Spinner />;
  }
  {
    tasks.error && <Error error={tasks.error} />;
  }
  {
    tasks.data && <List items={tasks.data.items} />;
  }
  ```

## 0.2.24

## 0.2.23

## 0.2.22

### Patch Changes

- [#1506](https://github.com/vertz-dev/vertz/pull/1506) [`92262cc`](https://github.com/vertz-dev/vertz/commit/92262cc2d6b2b975994b6d4fc223b35c4ae716a5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Stop exporting components directly from theme package. Scaffolded apps now use `registerTheme()` + `@vertz/ui/components` imports instead of destructuring from `configureTheme()`.

## 0.2.21

### Patch Changes

- [#1307](https://github.com/vertz-dev/vertz/pull/1307) [`2b462a9`](https://github.com/vertz-dev/vertz/commit/2b462a96eaa747bdd6448763a7d76c0e7a4fee21) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Read CLI version from package.json instead of hardcoded value and show version in scaffold output

## 0.2.20

### Patch Changes

- [#1281](https://github.com/vertz-dev/vertz/pull/1281) [`9a0a313`](https://github.com/vertz-dev/vertz/commit/9a0a3131656bb22a8cdfb351013c3a7a69cdd553) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add favicon to scaffold template and auto-detect it in the dev server

## 0.2.19

## 0.2.18

## 0.2.17

## 0.2.16

### Patch Changes

- [#1173](https://github.com/vertz-dev/vertz/pull/1173) [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix package release correctness: vertz subpath exports now point to built dist artifacts instead of raw .ts source, Turbo test inputs include out-of-src test directories, and create-vertz-app exposes test/typecheck scripts

## 0.2.15

## 0.2.14

### Patch Changes

- [#1089](https://github.com/vertz-dev/vertz/pull/1089) [`3254588`](https://github.com/vertz-dev/vertz/commit/3254588a2cfb3590eebda53a4648256cc4d51139) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Use `vertz` meta-package in scaffolded apps and add missing subpath exports (`db/sqlite`, `ui-server/bun-plugin`, `theme-shadcn`). Compiler now recognizes `vertz/*` imports alongside `@vertz/*`.

## 0.2.13

### Patch Changes

- [#944](https://github.com/vertz-dev/vertz/pull/944) [`cbda042`](https://github.com/vertz-dev/vertz/commit/cbda042603f9137cea2f032b7c842edc4c341dd7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz start` command to serve production builds. Supports API-only, UI-only, and full-stack modes with SSR, static file serving, CSS inlining, and graceful shutdown.

## 0.2.12

## 0.2.11

## 0.2.8

### Patch Changes

- [#903](https://github.com/vertz-dev/vertz/pull/903) [`2a2cadc`](https://github.com/vertz-dev/vertz/commit/2a2cadcaf6dee9eee9c4f869bb387f7bff67a123) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add bunfig.toml and bun-plugin-shim.ts to scaffolded projects. Without these, Bun's dev server client bundler skips the Vertz compiler plugin, causing SSR content to vanish after hydration.

## 0.2.7

## 0.2.6

## 0.2.5

## 0.2.2

### Patch Changes

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix bin entry: change shebang to `#!/usr/bin/env bun` and import from `dist/` instead of `src/` so the published CLI actually runs.
