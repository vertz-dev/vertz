# @vertz/theme-shadcn

## 0.2.22

### Patch Changes

- [#1498](https://github.com/vertz-dev/vertz/pull/1498) [`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert collapsible factory to declarative JSX component with sub-components (Collapsible.Trigger, Collapsible.Content)

- [#1505](https://github.com/vertz-dev/vertz/pull/1505) [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert DatePicker factory to declarative JSX component with sub-components (DatePicker.Trigger, DatePicker.Content)

- [#1535](https://github.com/vertz-dev/vertz/pull/1535) [`179829d`](https://github.com/vertz-dev/vertz/commit/179829d9df73097aead0d666a1b130c9a138573b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix dialog close animation not playing with native `<dialog>`. Reorder close logic to call hideDialog() before updating reactive state, force reflow to start CSS animation, prevent native close on Escape, and add ::backdrop fade-out animation.

- [#1532](https://github.com/vertz-dev/vertz/pull/1532) [`8ab61a4`](https://github.com/vertz-dev/vertz/commit/8ab61a414fb759f6c086db6ee6e1aec95545daf9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add global CSS rule to hide `dialog:not([open])` elements, preventing content flash during SSR-to-hydration transition

- [#1500](https://github.com/vertz-dev/vertz/pull/1500) [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert HoverCard factory to JSX component with composed primitives

- [#1533](https://github.com/vertz-dev/vertz/pull/1533) [`e5d8d4d`](https://github.com/vertz-dev/vertz/commit/e5d8d4d49da65c13fb5c76ec279314052273da30) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Popover and DropdownMenu content panels taking full width instead of fitting content

- [#1504](https://github.com/vertz-dev/vertz/pull/1504) [`32dc39b`](https://github.com/vertz-dev/vertz/commit/32dc39b9f23b89aa387be49303fc6fcc4dceccdd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove unnecessary type castings from themed primitive components. Eliminated `as ComposedProps` and `as ThemedComponent` casts across 23 files where proper type inference works naturally through `withStyles()` and `Object.assign`. Only JSX-to-HTMLElement narrowing casts (3 in drawer.tsx) remain with SAFETY comments.

- [#1507](https://github.com/vertz-dev/vertz/pull/1507) [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ResizablePanel factory to JSX component with context-based sub-components

- [#1502](https://github.com/vertz-dev/vertz/pull/1502) [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ScrollArea factory to JSX component with composed primitives

- [#1534](https://github.com/vertz-dev/vertz/pull/1534) [`fabfb87`](https://github.com/vertz-dev/vertz/commit/fabfb879cd93dbcedbae4490996e8ce9cedf9457) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Select: click-outside dismiss, add chevron SVG icon, float dropdown over content

- [#1538](https://github.com/vertz-dev/vertz/pull/1538) [`9b8af7b`](https://github.com/vertz-dev/vertz/commit/9b8af7b7645cf274e5b2eaacb1680822cd115063) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Sheet panels not taking full viewport height/width after native dialog rewrite. Left/right panels now set `height: 100dvh` and `max-height: none`; top/bottom panels set `width: 100dvw` and `max-width: none` to override the `<dialog>` UA stylesheet constraints.

- [#1503](https://github.com/vertz-dev/vertz/pull/1503) [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ToggleGroup factory to JSX component with composed primitives

- Updated dependencies [[`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc), [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd), [`179829d`](https://github.com/vertz-dev/vertz/commit/179829d9df73097aead0d666a1b130c9a138573b), [`4c96794`](https://github.com/vertz-dev/vertz/commit/4c967943b0289542b0162556e299a309e4a86f1f), [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69), [`e248ac3`](https://github.com/vertz-dev/vertz/commit/e248ac37bb9639d213ad5326d70db08a59adb7ff), [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5), [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3), [`fabfb87`](https://github.com/vertz-dev/vertz/commit/fabfb879cd93dbcedbae4490996e8ce9cedf9457), [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e)]:
  - @vertz/ui-primitives@0.2.22
  - @vertz/ui@0.2.22

## 0.2.21

### Patch Changes

- [#1317](https://github.com/vertz-dev/vertz/pull/1317) [`e093f38`](https://github.com/vertz-dev/vertz/commit/e093f38d9e64a42582f508b7d22ed274e1210681) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - `AlertDialog.Action` and `AlertDialog.Cancel` now accept `onClick` and other event handler props. Previously these were silently ignored because `AlertDialogSlotProps` only allowed `children` and `class`.

- [#1485](https://github.com/vertz-dev/vertz/pull/1485) [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert calendar from factory API to declarative JSX component. `Calendar` is now a PascalCase component importable from `@vertz/ui/components`, replacing the lowercase `calendar` factory.

- [#1488](https://github.com/vertz-dev/vertz/pull/1488) [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert carousel from factory pattern to declarative JSX component with Carousel.Slide, Carousel.Previous, and Carousel.Next sub-components

- [#1461](https://github.com/vertz-dev/vertz/pull/1461) [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add centralized theme API — registerTheme() + @vertz/ui/components

  Adds `registerTheme()` to `@vertz/ui` and a new `@vertz/ui/components` subpath export. Developers can now register a theme once and import components from a single, stable path instead of threading theme references through local modules.

  `@vertz/theme-shadcn` now provides module augmentation for `@vertz/ui/components`, giving full type safety to centralized component imports when the theme package is installed.

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- [#1497](https://github.com/vertz-dev/vertz/pull/1497) [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert command factory to declarative JSX component with sub-components (Command.Input, Command.List, Command.Empty, Command.Item, Command.Group, Command.Separator)

- [#1489](https://github.com/vertz-dev/vertz/pull/1489) [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(theme-shadcn): convert contextMenu factory to JSX component

  Convert the `contextMenu` primitive from an imperative factory function to a
  declarative JSX component with `.Trigger`, `.Content`, `.Item`, `.Group`,
  `.Label`, and `.Separator` sub-components.

  - Add `ComposedContextMenu` in `@vertz/ui-primitives` (context-based sub-component wiring)
  - Replace imperative `createThemedContextMenu` factory with `withStyles()` wrapper
  - Promote from lowercase `contextMenu` factory to PascalCase `ContextMenu` compound proxy
  - Importable from `@vertz/ui/components` as `ContextMenu`
  - No `document.createElement` — fully declarative JSX

- [#1487](https://github.com/vertz-dev/vertz/pull/1487) [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert drawer factory to declarative JSX component with sub-components (Trigger, Content, Header, Title, Description, Footer, Handle)

- [#1316](https://github.com/vertz-dev/vertz/pull/1316) [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify css() nested selector object shape from `{ property: 'x', value: 'y' }` to plain `{ 'x': 'y' }`. Remove RawDeclaration type. Support both direct object and array-with-objects forms for nested selectors.

- [#1355](https://github.com/vertz-dev/vertz/pull/1355) [`cda8b4b`](https://github.com/vertz-dev/vertz/commit/cda8b4b75a52eab1459b41adf686bbe90e5fcf97) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Move event handler wiring (`wireEventHandlers`, `isKnownEventHandler`, `ElementEventHandlers`) from `@vertz/theme-shadcn` to `@vertz/ui-primitives/utils`. Add `applyProps()` utility that combines event wiring and attribute forwarding. Theme components now delegate DOM behavior to primitives.

- [#1383](https://github.com/vertz-dev/vertz/pull/1383) [`4f5c101`](https://github.com/vertz-dev/vertz/commit/4f5c101424c2f7009ef750b2c12c220f377e0813) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-primitives,theme-shadcn): wire missing DropdownMenu onOpenChange, AlertDialog Header, and Select indicator/chevron

  - DropdownMenu: add `onOpenChange` to `ComposedDropdownMenuProps` and themed `DropdownMenuRootProps`, forward to `Menu.Root`
  - AlertDialog: expose `Header` sub-component on `ThemedAlertDialogComponent` type and factory
  - Select: add check indicator (`data-part="indicator"`) to items and chevron icon (`data-part="chevron"`) to trigger, wire `itemIndicator` class through themed factory

- [#1330](https://github.com/vertz-dev/vertz/pull/1330) [`aacd22a`](https://github.com/vertz-dev/vertz/commit/aacd22a3ccf72d92ed89381708ca826fcbcda9ae) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - `Input` and `Textarea` now wire `on*` props (e.g. `onInput`, `onChange`, `onFocus`) as event listeners instead of setting them as string attributes. Also adds `onInput` and `onChange` to the shared `ElementEventHandlers` interface.

- [#1490](https://github.com/vertz-dev/vertz/pull/1490) [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert menubar from factory to declarative JSX component with sub-components (Menubar.Menu, Menubar.Trigger, Menubar.Content, Menubar.Item, Menubar.Group, Menubar.Label, Menubar.Separator)

- [#1495](https://github.com/vertz-dev/vertz/pull/1495) [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert `navigationMenu` factory to declarative `NavigationMenu` JSX component with `.List`, `.Item`, `.Trigger`, `.Content`, `.Link`, `.Viewport` sub-components. Importable from `@vertz/ui/components`.

- [#1389](https://github.com/vertz-dev/vertz/pull/1389) [`027890d`](https://github.com/vertz-dev/vertz/commit/027890d736a3b47f545e3e110693f118041042b2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire `label` class key through Select: add `label` to `SelectClasses`, render a visible group label element in `SelectGroup`, and pass `label` styles in `createThemedSelect()`.

- [#1415](https://github.com/vertz-dev/vertz/pull/1415) [`d760784`](https://github.com/vertz-dev/vertz/commit/d76078402df8eed4888589fd128142bb10e6d69a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Sheet overlay no longer blocks pointer events when closed. Added `pointer-events: none` to the overlay's closed state in both the theme CSS and the composed component's inline style.

- Updated dependencies [[`f933062`](https://github.com/vertz-dev/vertz/commit/f93306200b0d994280b45ecd7c62a76d35e699e3), [`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a), [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029), [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf), [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88), [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0), [`646fc3f`](https://github.com/vertz-dev/vertz/commit/646fc3f82d21c79447a6560e40a08f8463709167), [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c), [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845), [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a), [`cda8b4b`](https://github.com/vertz-dev/vertz/commit/cda8b4b75a52eab1459b41adf686bbe90e5fcf97), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95), [`4f5c101`](https://github.com/vertz-dev/vertz/commit/4f5c101424c2f7009ef750b2c12c220f377e0813), [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa), [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e), [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10), [`427e519`](https://github.com/vertz-dev/vertz/commit/427e5194a7f783c2accc246409bf146dcfa2f1b7), [`86fb89b`](https://github.com/vertz-dev/vertz/commit/86fb89bc7b7f681c45fd2ac823ab493a91574b38), [`41565d7`](https://github.com/vertz-dev/vertz/commit/41565d7960871c4a1f38f4019894302a4a7e7ff1), [`0d973b0`](https://github.com/vertz-dev/vertz/commit/0d973b03a06e8d53e23c4be315bfcc23ec1d534e), [`72348fe`](https://github.com/vertz-dev/vertz/commit/72348fe2fb0dfd8e63ec5f9f4db3973ecb3e494e), [`027890d`](https://github.com/vertz-dev/vertz/commit/027890d736a3b47f545e3e110693f118041042b2), [`d760784`](https://github.com/vertz-dev/vertz/commit/d76078402df8eed4888589fd128142bb10e6d69a), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`cba472a`](https://github.com/vertz-dev/vertz/commit/cba472a554330cab18778c7c60e088e50a39a4ec), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc), [`9a6eb66`](https://github.com/vertz-dev/vertz/commit/9a6eb6635b4c9776c3062e6d89ef79955435baa9), [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc), [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c), [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02)]:
  - @vertz/ui-primitives@0.2.21
  - @vertz/ui@0.2.21

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
