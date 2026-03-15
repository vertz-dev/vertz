# @vertz/theme-shadcn

## 0.2.21

### Patch Changes

- [#1317](https://github.com/vertz-dev/vertz/pull/1317) [`e093f38`](https://github.com/vertz-dev/vertz/commit/e093f38d9e64a42582f508b7d22ed274e1210681) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - `AlertDialog.Action` and `AlertDialog.Cancel` now accept `onClick` and other event handler props. Previously these were silently ignored because `AlertDialogSlotProps` only allowed `children` and `class`.

- [#1316](https://github.com/vertz-dev/vertz/pull/1316) [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify css() nested selector object shape from `{ property: 'x', value: 'y' }` to plain `{ 'x': 'y' }`. Remove RawDeclaration type. Support both direct object and array-with-objects forms for nested selectors.

- [#1330](https://github.com/vertz-dev/vertz/pull/1330) [`aacd22a`](https://github.com/vertz-dev/vertz/commit/aacd22a3ccf72d92ed89381708ca826fcbcda9ae) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - `Input` and `Textarea` now wire `on*` props (e.g. `onInput`, `onChange`, `onFocus`) as event listeners instead of setting them as string attributes. Also adds `onInput` and `onChange` to the shared `ElementEventHandlers` interface.

- Updated dependencies [[`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a)]:
  - @vertz/ui@0.2.21
  - @vertz/ui-primitives@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.20
  - @vertz/ui-primitives@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.19
  - @vertz/ui-primitives@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [[`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91), [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b), [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58)]:
  - @vertz/ui@0.2.18
  - @vertz/ui-primitives@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17
  - @vertz/ui-primitives@0.2.17

## 0.2.16

### Patch Changes

- [#1155](https://github.com/vertz-dev/vertz/pull/1155) [`548d9fb`](https://github.com/vertz-dev/vertz/commit/548d9fb98dcf043bae7fc729d55b9a91a28f4de6) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `@vertz/theme-shadcn/base` subpath export with `configureThemeBase()` for lightweight theme setup without bundling 38 style factories and 30+ component factories.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8), [`7de4b67`](https://github.com/vertz-dev/vertz/commit/7de4b67985065450262fa6f5a3acdc6b269f177e), [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61), [`9ea1dc0`](https://github.com/vertz-dev/vertz/commit/9ea1dc08a892918af7fbe5433293cf7c370f34f0), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc)]:
  - @vertz/ui@0.2.16
  - @vertz/ui-primitives@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/ui@0.2.15
  - @vertz/ui-primitives@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.14
  - @vertz/ui-primitives@0.2.14

## 0.2.13

### Patch Changes

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211), [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui@0.2.13
  - @vertz/ui-primitives@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui@0.2.12
  - @vertz/ui-primitives@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies [[`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a)]:
  - @vertz/ui@0.2.11
  - @vertz/ui-primitives@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.8
  - @vertz/ui-primitives@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.7
  - @vertz/ui-primitives@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.6
  - @vertz/ui-primitives@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.5
  - @vertz/ui-primitives@0.2.5

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/ui@0.2.2
  - @vertz/ui-primitives@0.2.2
