# @vertz/ui-primitives

## 0.2.74

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.74

## 0.2.73

### Patch Changes

- Updated dependencies [[`7e80041`](https://github.com/vertz-dev/vertz/commit/7e80041df6d5708fb54177edeef8bd211e368c7c), [`c724744`](https://github.com/vertz-dev/vertz/commit/c724744924b75e215201c0d19b047f4b8a287044), [`5223868`](https://github.com/vertz-dev/vertz/commit/5223868cb3001349065cc246e0ca8a03ad9356f4), [`b8253ad`](https://github.com/vertz-dev/vertz/commit/b8253ad485fba3fc04164db116ee0192e629b3d2)]:
  - @vertz/ui@0.2.73

## 0.2.72

### Patch Changes

- Updated dependencies [[`d8e23a1`](https://github.com/vertz-dev/vertz/commit/d8e23a13049afb0a8611c63081bf799dc9790f77), [`8bed545`](https://github.com/vertz-dev/vertz/commit/8bed5454aeeec6c374ceb43bccc92841442d87da), [`e2db646`](https://github.com/vertz-dev/vertz/commit/e2db646ea254b60c9bec01d51400c1c46c328c98), [`8d8976d`](https://github.com/vertz-dev/vertz/commit/8d8976dd3d2d2475f37d0df79f8477fd3f58395f), [`36a459d`](https://github.com/vertz-dev/vertz/commit/36a459d191d732370cb4020533c7f8494622f1b5)]:
  - @vertz/ui@0.2.72

## 0.2.71

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.71

## 0.2.70

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.70

## 0.2.69

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.69

## 0.2.68

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.68

## 0.2.67

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.67

## 0.2.66

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.66

## 0.2.65

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.65

## 0.2.64

### Patch Changes

- Updated dependencies [[`840ace1`](https://github.com/vertz-dev/vertz/commit/840ace1f1c4a203e572394f322ee9b5c428537fa)]:
  - @vertz/ui@0.2.64

## 0.2.63

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.63

## 0.2.62

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.62

## 0.2.61

### Patch Changes

- [#2613](https://github.com/vertz-dev/vertz/pull/2613) [`7e2cbb5`](https://github.com/vertz-dev/vertz/commit/7e2cbb5fb742ce8bd0f5fac7c2e46a2e43b0b8ef) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix composed component test failures: use style.cssText instead of setAttribute for style bindings in compiler and runtime, add missing DOM shim classes (HTMLHeadingElement, HTMLParagraphElement, PointerEvent), fix style/StyleMap sync, and fix HTMLSelectElement.selectedIndex

- Updated dependencies [[`7e2cbb5`](https://github.com/vertz-dev/vertz/commit/7e2cbb5fb742ce8bd0f5fac7c2e46a2e43b0b8ef)]:
  - @vertz/ui@0.2.61

## 0.2.60

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.60

## 0.2.59

### Patch Changes

- [#2517](https://github.com/vertz-dev/vertz/pull/2517) [`6a6282b`](https://github.com/vertz-dev/vertz/commit/6a6282b3525f850fe0db6d11308dcd4801f89bb3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add AppShell layout component for SaaS apps (#1661)

- Updated dependencies [[`6a6282b`](https://github.com/vertz-dev/vertz/commit/6a6282b3525f850fe0db6d11308dcd4801f89bb3)]:
  - @vertz/ui@0.2.59

## 0.2.58

### Patch Changes

- Updated dependencies [[`066bf9f`](https://github.com/vertz-dev/vertz/commit/066bf9f0be12865570c13414d595fd6dc77c1761), [`4ccb5db`](https://github.com/vertz-dev/vertz/commit/4ccb5db72f7b14f9cb3d50bff77dc26a34c8bd53)]:
  - @vertz/ui@0.2.58

## 0.2.57

### Patch Changes

- Updated dependencies [[`f9ac074`](https://github.com/vertz-dev/vertz/commit/f9ac0740448bbcece50886a387184898da625933)]:
  - @vertz/ui@0.2.57

## 0.2.56

### Patch Changes

- [#2459](https://github.com/vertz-dev/vertz/pull/2459) [`52ebef6`](https://github.com/vertz-dev/vertz/commit/52ebef61c623f77becfde5bef8115a32daf027a6) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(build): use native compiler for library builds so Provider children are thunked

  Library packages (ui-primitives, theme-shadcn) were compiled with Bun's JSX fallback
  instead of the native Rust compiler. The fallback doesn't wrap JSX children in thunks,
  causing context-based components (List, Tabs, Dialog, etc.) to throw "must be used
  inside" errors because children evaluate before the Provider sets up context.

- Updated dependencies []:
  - @vertz/ui@0.2.56

## 0.2.55

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.55

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.51

## 0.2.50

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.49

## 0.2.48

### Patch Changes

- [#2265](https://github.com/vertz-dev/vertz/pull/2265) [`36b0f20`](https://github.com/vertz-dev/vertz/commit/36b0f2007822bc5c580d04a30d4ef1ecbee2146b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add form-level onChange with per-input debounce

  `<form onChange={handler}>` fires when any child input changes, receiving all current form values as a `FormValues` object. Per-input `debounce={ms}` delays the callback for text inputs while immediate controls (selects, checkboxes) flush instantly.

  **Breaking:** `onChange` on `<form>` now receives `FormValues` instead of a DOM `Event`. Use `ref` + `addEventListener` for the raw DOM event.

- Updated dependencies [[`46397c6`](https://github.com/vertz-dev/vertz/commit/46397c67af30f5441cebdca616f3a1627111312d), [`36b0f20`](https://github.com/vertz-dev/vertz/commit/36b0f2007822bc5c580d04a30d4ef1ecbee2146b)]:
  - @vertz/ui@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.47

## 0.2.46

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.43

## 0.2.42

### Patch Changes

- [#2149](https://github.com/vertz-dev/vertz/pull/2149) [`1eeec6c`](https://github.com/vertz-dev/vertz/commit/1eeec6c95c0ced4d869995dbdce205c3bde92a25) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Input component focus loss with value+onInput binding: handle IDL properties (value, checked) via Reflect.set in \_\_spread, preserve getter descriptors in withStyles, and emit reactive source parameter from compiler

- Updated dependencies [[`caaee34`](https://github.com/vertz-dev/vertz/commit/caaee3414f28d055b3065dc2d4ef67c9e3856ab9), [`1eeec6c`](https://github.com/vertz-dev/vertz/commit/1eeec6c95c0ced4d869995dbdce205c3bde92a25)]:
  - @vertz/ui@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies [[`7f837fc`](https://github.com/vertz-dev/vertz/commit/7f837fc10a0acd4ad77bfc4bcaf733700c8a4f8b)]:
  - @vertz/ui@0.2.41

## 0.2.40

### Patch Changes

- [#1994](https://github.com/vertz-dev/vertz/pull/1994) [`7c89bf1`](https://github.com/vertz-dev/vertz/commit/7c89bf196ff00ce8d17744f43a40f2dadfb5d989) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: prevent client-side crash when composed primitives fail to resolve in the bundle

  Primitives in configureTheme() are now lazily initialized — each is created only on first access instead of all 29 being eagerly initialized during registerTheme(). This isolates import resolution failures to the specific primitive that's broken, rather than crashing the entire theme.

  Also adds a guard in withStyles() that throws a descriptive error when a component is undefined, replacing the opaque "Cannot convert undefined or null to object" crash.

- Updated dependencies [[`bee011e`](https://github.com/vertz-dev/vertz/commit/bee011e47661b31152ad3dfc589fd45eda2f3e44)]:
  - @vertz/ui@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies [[`7bf733f`](https://github.com/vertz-dev/vertz/commit/7bf733fec92424d08a08dafe3b4c4a5984f084b0), [`a948ef1`](https://github.com/vertz-dev/vertz/commit/a948ef160c244fb2e42cd53e7190b8bf6a96f9db)]:
  - @vertz/ui@0.2.39

## 0.2.38

### Patch Changes

- Updated dependencies [[`20344c0`](https://github.com/vertz-dev/vertz/commit/20344c0a7df8260ce98034bd0e2de73ef11ecfcd)]:
  - @vertz/ui@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies [[`12231be`](https://github.com/vertz-dev/vertz/commit/12231be46d322526be6d8b6752911d88f025e4d0)]:
  - @vertz/ui@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies [[`94a3244`](https://github.com/vertz-dev/vertz/commit/94a32446298cc6d8b76849abec315e980d5a4341), [`9281153`](https://github.com/vertz-dev/vertz/commit/9281153c407654e4cf26c5c41af3274128301e3e)]:
  - @vertz/ui@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies [[`5a80932`](https://github.com/vertz-dev/vertz/commit/5a8093299d96eefd00f0208af61eeb37aef28014)]:
  - @vertz/ui@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies [[`3399191`](https://github.com/vertz-dev/vertz/commit/339919192bd95b5d212abf7f6d3746101c8d5422)]:
  - @vertz/ui@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies [[`ca59e8b`](https://github.com/vertz-dev/vertz/commit/ca59e8b824806cc222521677abbdcbb753347969)]:
  - @vertz/ui@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies [[`0ba086d`](https://github.com/vertz-dev/vertz/commit/0ba086d9bca13cac9e0a27a1cbd199c8b5ca6a07), [`1d36182`](https://github.com/vertz-dev/vertz/commit/1d36182b0678378d50d9a063d6471a9114712b6a)]:
  - @vertz/ui@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies [[`7771170`](https://github.com/vertz-dev/vertz/commit/777117093d783aaeecc905ec65c4c85363746494)]:
  - @vertz/ui@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies [[`8552f21`](https://github.com/vertz-dev/vertz/commit/8552f217350e2acb0caac26ac215a49736b07e55)]:
  - @vertz/ui@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies [[`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832), [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf)]:
  - @vertz/ui@0.2.25

## 0.2.24

### Patch Changes

- [#1712](https://github.com/vertz-dev/vertz/pull/1712) [`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add EmptyState compound component and Skeleton.Text/Circle sub-components

  New `EmptyState` compound component with Icon, Title, Description, and Action slots for empty-data placeholders. New `Skeleton.Text` (multi-line text placeholder) and `Skeleton.Circle` (circular avatar placeholder) sub-components. Skeleton `base` class key renamed to `root` for consistency.

- Updated dependencies [[`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8), [`d58a100`](https://github.com/vertz-dev/vertz/commit/d58a100f18762189be4319b58a4b86f8a774ac95), [`0e33400`](https://github.com/vertz-dev/vertz/commit/0e33400d96a9f778f3b936124d7544804f731db9), [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb), [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba)]:
  - @vertz/ui@0.2.24

## 0.2.23

### Patch Changes

- [#1585](https://github.com/vertz-dev/vertz/pull/1585) [`18b300a`](https://github.com/vertz-dev/vertz/commit/18b300adadcdea445ab708b10c2600489e865f52) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add captionLayout prop to Calendar for month/year dropdown navigation

- [#1618](https://github.com/vertz-dev/vertz/pull/1618) [`f609e2d`](https://github.com/vertz-dev/vertz/commit/f609e2d93773f4b11d3b981e8a50af643abbf0c4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Command component styling: empty state starts hidden, increased list top-padding for input-to-results gap

- [#1544](https://github.com/vertz-dev/vertz/pull/1544) [`173e9cb`](https://github.com/vertz-dev/vertz/commit/173e9cb0fc08e00f618eeedde1101b760c6de4b2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add keyboard navigation to composed ContextMenu (ArrowUp/Down, Enter, Escape, Tab)

- [#1594](https://github.com/vertz-dev/vertz/pull/1594) [`e57868e`](https://github.com/vertz-dev/vertz/commit/e57868ee9097c53722237b3d2cf5bee1ffff085b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Forward `captionLayout` prop through DatePicker to enable dropdown month/year navigation

- [#1542](https://github.com/vertz-dev/vertz/pull/1542) [`9caf0bc`](https://github.com/vertz-dev/vertz/commit/9caf0bce30d59cd284dbf9687ee2c79765bbb563) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add ArrowUp/ArrowDown item navigation and Space key selection to Menubar content keyboard handler

- [#1620](https://github.com/vertz-dev/vertz/pull/1620) [`14e032c`](https://github.com/vertz-dev/vertz/commit/14e032c00a2af9a6c3d7f53bce548343990ac953) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Select dropdown open/close animation: correct keyframe names and defer display:none until exit animation completes

- Updated dependencies [[`10f6309`](https://github.com/vertz-dev/vertz/commit/10f6309790bff69c7a1a0ab92e50f78f34b129c3), [`1709f6d`](https://github.com/vertz-dev/vertz/commit/1709f6d933f04600d1b959b51660f2f8f33805d8), [`1e26cca`](https://github.com/vertz-dev/vertz/commit/1e26cca7eca00291633a2fa6257fc80a1f409b60), [`82055ae`](https://github.com/vertz-dev/vertz/commit/82055aefc19e4c3a115152f2e7157389486e792e), [`a21f762`](https://github.com/vertz-dev/vertz/commit/a21f76239e5c4b112c7be9a4ebea8327c3d2230b), [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8)]:
  - @vertz/ui@0.2.23

## 0.2.22

### Patch Changes

- [#1498](https://github.com/vertz-dev/vertz/pull/1498) [`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert collapsible factory to declarative JSX component with sub-components (Collapsible.Trigger, Collapsible.Content)

- [#1505](https://github.com/vertz-dev/vertz/pull/1505) [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert DatePicker factory to declarative JSX component with sub-components (DatePicker.Trigger, DatePicker.Content)

- [#1535](https://github.com/vertz-dev/vertz/pull/1535) [`179829d`](https://github.com/vertz-dev/vertz/commit/179829d9df73097aead0d666a1b130c9a138573b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix dialog close animation not playing with native `<dialog>`. Reorder close logic to call hideDialog() before updating reactive state, force reflow to start CSS animation, prevent native close on Escape, and add ::backdrop fade-out animation.

- [#1530](https://github.com/vertz-dev/vertz/pull/1530) [`4c96794`](https://github.com/vertz-dev/vertz/commit/4c967943b0289542b0162556e299a309e4a86f1f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix 7 test failures in composed components (context-menu, menubar, carousel, command, hover-card): wire event handlers via JSX instead of dead onMount blocks, fix focus/blur to use bubbling focusin/focusout events, work around happy-dom wrapper identity issue in tests.

- [#1500](https://github.com/vertz-dev/vertz/pull/1500) [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert HoverCard factory to JSX component with composed primitives

- [#1537](https://github.com/vertz-dev/vertz/pull/1537) [`e248ac3`](https://github.com/vertz-dev/vertz/commit/e248ac37bb9639d213ad5326d70db08a59adb7ff) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove getElementById workarounds from Dialog, AlertDialog, and Sheet composed components. Share dialog ref through context so showModal/close use ref directly instead of document.getElementById. JSX event handlers on CSR-rendered elements inside \_\_child wrappers are already on DOM-connected elements, making the imperative onMount+getElementById wiring unnecessary.

- [#1507](https://github.com/vertz-dev/vertz/pull/1507) [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ResizablePanel factory to JSX component with context-based sub-components

- [#1502](https://github.com/vertz-dev/vertz/pull/1502) [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ScrollArea factory to JSX component with composed primitives

- [#1534](https://github.com/vertz-dev/vertz/pull/1534) [`fabfb87`](https://github.com/vertz-dev/vertz/commit/fabfb879cd93dbcedbae4490996e8ce9cedf9457) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Select: click-outside dismiss, add chevron SVG icon, float dropdown over content

- [#1503](https://github.com/vertz-dev/vertz/pull/1503) [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ToggleGroup factory to JSX component with composed primitives

- Updated dependencies [[`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc), [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd), [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69), [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5), [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3), [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e)]:
  - @vertz/ui@0.2.22

## 0.2.21

### Patch Changes

- [#1374](https://github.com/vertz-dev/vertz/pull/1374) [`f933062`](https://github.com/vertz-dev/vertz/commit/f93306200b0d994280b45ecd7c62a76d35e699e3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-primitives): make AlertDialog hide() idempotent and add early return in event delegation

- [#1485](https://github.com/vertz-dev/vertz/pull/1485) [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert calendar from factory API to declarative JSX component. `Calendar` is now a PascalCase component importable from `@vertz/ui/components`, replacing the lowercase `calendar` factory.

- [#1488](https://github.com/vertz-dev/vertz/pull/1488) [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert carousel from factory pattern to declarative JSX component with Carousel.Slide, Carousel.Previous, and Carousel.Next sub-components

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- [#1497](https://github.com/vertz-dev/vertz/pull/1497) [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert command factory to declarative JSX component with sub-components (Command.Input, Command.List, Command.Empty, Command.Item, Command.Group, Command.Separator)

- [#1354](https://github.com/vertz-dev/vertz/pull/1354) [`646fc3f`](https://github.com/vertz-dev/vertz/commit/646fc3f82d21c79447a6560e40a08f8463709167) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Composed primitives (Dialog, AlertDialog, Sheet, DropdownMenu, Popover) now clean up event listeners on disposal. Previously, `addEventListener` calls on trigger and content elements never had matching `removeEventListener`, causing listener leaks when components were removed from the DOM.

- [#1489](https://github.com/vertz-dev/vertz/pull/1489) [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(theme-shadcn): convert contextMenu factory to JSX component

  Convert the `contextMenu` primitive from an imperative factory function to a
  declarative JSX component with `.Trigger`, `.Content`, `.Item`, `.Group`,
  `.Label`, and `.Separator` sub-components.

  - Add `ComposedContextMenu` in `@vertz/ui-primitives` (context-based sub-component wiring)
  - Replace imperative `createThemedContextMenu` factory with `withStyles()` wrapper
  - Promote from lowercase `contextMenu` factory to PascalCase `ContextMenu` compound proxy
  - Importable from `@vertz/ui/components` as `ContextMenu`
  - No `document.createElement` — fully declarative JSX

- [#1355](https://github.com/vertz-dev/vertz/pull/1355) [`cda8b4b`](https://github.com/vertz-dev/vertz/commit/cda8b4b75a52eab1459b41adf686bbe90e5fcf97) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Move event handler wiring (`wireEventHandlers`, `isKnownEventHandler`, `ElementEventHandlers`) from `@vertz/theme-shadcn` to `@vertz/ui-primitives/utils`. Add `applyProps()` utility that combines event wiring and attribute forwarding. Theme components now delegate DOM behavior to primitives.

- [#1383](https://github.com/vertz-dev/vertz/pull/1383) [`4f5c101`](https://github.com/vertz-dev/vertz/commit/4f5c101424c2f7009ef750b2c12c220f377e0813) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-primitives,theme-shadcn): wire missing DropdownMenu onOpenChange, AlertDialog Header, and Select indicator/chevron

  - DropdownMenu: add `onOpenChange` to `ComposedDropdownMenuProps` and themed `DropdownMenuRootProps`, forward to `Menu.Root`
  - AlertDialog: expose `Header` sub-component on `ThemedAlertDialogComponent` type and factory
  - Select: add check indicator (`data-part="indicator"`) to items and chevron icon (`data-part="chevron"`) to trigger, wire `itemIndicator` class through themed factory

- [#1490](https://github.com/vertz-dev/vertz/pull/1490) [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert menubar from factory to declarative JSX component with sub-components (Menubar.Menu, Menubar.Trigger, Menubar.Content, Menubar.Item, Menubar.Group, Menubar.Label, Menubar.Separator)

- [#1495](https://github.com/vertz-dev/vertz/pull/1495) [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert `navigationMenu` factory to declarative `NavigationMenu` JSX component with `.List`, `.Item`, `.Trigger`, `.Content`, `.Link`, `.Viewport` sub-components. Importable from `@vertz/ui/components`.

- [#1391](https://github.com/vertz-dev/vertz/pull/1391) [`427e519`](https://github.com/vertz-dev/vertz/commit/427e5194a7f783c2accc246409bf146dcfa2f1b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-compiler): object/array literals no longer incorrectly wrapped in computed()

  The ReactivityAnalyzer now skips object and array literal initializers during
  computed classification, matching the existing behavior for function definitions.
  This removes the need for `build*Ctx()` helper workarounds in composed primitives.

- [#1395](https://github.com/vertz-dev/vertz/pull/1395) [`86fb89b`](https://github.com/vertz-dev/vertz/commit/86fb89bc7b7f681c45fd2ac823ab493a91574b38) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add disabled item support to low-level Radio.Item and skip disabled items in handleListNavigation keyboard navigation

- [#1388](https://github.com/vertz-dev/vertz/pull/1388) [`41565d7`](https://github.com/vertz-dev/vertz/commit/41565d7960871c4a1f38f4019894302a4a7e7ff1) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - ComposedRadioGroup now supports Home/End keys to jump to the first/last enabled item, skipping disabled items.

- [#1382](https://github.com/vertz-dev/vertz/pull/1382) [`0d973b0`](https://github.com/vertz-dev/vertz/commit/0d973b03a06e8d53e23c4be315bfcc23ec1d534e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - RadioGroup keyboard navigation now skips disabled items. Low-level primitives (Radio, Tabs, Calendar) expose `destroy()` for event listener cleanup.

- [#1351](https://github.com/vertz-dev/vertz/pull/1351) [`72348fe`](https://github.com/vertz-dev/vertz/commit/72348fe2fb0dfd8e63ec5f9f4db3973ecb3e494e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove dead context creation in composed Select, Tabs, and Accordion primitives

- [#1389](https://github.com/vertz-dev/vertz/pull/1389) [`027890d`](https://github.com/vertz-dev/vertz/commit/027890d736a3b47f545e3e110693f118041042b2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire `label` class key through Select: add `label` to `SelectClasses`, render a visible group label element in `SelectGroup`, and pass `label` styles in `createThemedSelect()`.

- [#1415](https://github.com/vertz-dev/vertz/pull/1415) [`d760784`](https://github.com/vertz-dev/vertz/commit/d76078402df8eed4888589fd128142bb10e6d69a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Sheet overlay no longer blocks pointer events when closed. Added `pointer-events: none` to the overlay's closed state in both the theme CSS and the composed component's inline style.

- [#1400](https://github.com/vertz-dev/vertz/pull/1400) [`cba472a`](https://github.com/vertz-dev/vertz/commit/cba472a554330cab18778c7c60e088e50a39a4ec) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Strip redundant bare chunk imports from barrel output and revert sideEffects to false for optimal tree-shaking

- [#1384](https://github.com/vertz-dev/vertz/pull/1384) [`9a6eb66`](https://github.com/vertz-dev/vertz/commit/9a6eb6635b4c9776c3062e6d89ef79955435baa9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Composed Tooltip trigger now sets `aria-describedby` on the user's child element (not just the primitive wrapper). All four composed primitives (Tooltip, Popover, Select, DropdownMenu) now forward `positioning` options to their underlying primitive `Root()`.

- Updated dependencies [[`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a), [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029), [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf), [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88), [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0), [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c), [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845), [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95), [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa), [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e), [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc), [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc), [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c), [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02)]:
  - @vertz/ui@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [[`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91), [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b), [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58)]:
  - @vertz/ui@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17

## 0.2.16

### Patch Changes

- [#1175](https://github.com/vertz-dev/vertz/pull/1175) [`7de4b67`](https://github.com/vertz-dev/vertz/commit/7de4b67985065450262fa6f5a3acdc6b269f177e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `sideEffects` metadata to declare shared chunks as side-effectful, eliminating `ignored-bare-import` warnings during tree-shaking. Add regression test that fails on these warnings.

- [#1153](https://github.com/vertz-dev/vertz/pull/1153) [`9ea1dc0`](https://github.com/vertz-dev/vertz/commit/9ea1dc08a892918af7fbe5433293cf7c370f34f0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Multi-entry build for better tree-shaking. Importing a single component (e.g. Tooltip) no longer pulls in all 30+ headless primitives. Single-import bundles drop from 100% to 16% of the full package.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8), [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc)]:
  - @vertz/ui@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/ui@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.14

## 0.2.13

### Patch Changes

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211), [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies [[`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a)]:
  - @vertz/ui@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.5

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/ui@0.2.2

## 0.1.1

### Patch Changes

- [#199](https://github.com/vertz-dev/vertz/pull/199) [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Initial release of @vertz/ui v0.1 — a compiler-driven reactive UI framework.

  - Reactivity: `signal()`, `computed()`, `effect()`, `batch()`, `untrack()`
  - Compiler: `let` → signal, `const` derived → computed, JSX → DOM helpers, mutation → peek/notify
  - Component model: `ref()`, `onMount()`, `onCleanup()`, `watch()`, `children()`, `createContext()`
  - Error handling: `ErrorBoundary`, `Suspense` with async support
  - CSS-in-JS: `css()` with type-safe properties, `variants()`, `globalCss()`, `s()` shorthand
  - Theming: `defineTheme()`, `ThemeProvider`, CSS variable generation
  - Zero-runtime CSS extraction via compiler plugin
  - Forms: `form()` with schema validation, `formDataToObject()`, SDK method integration
  - Data fetching: `query()` with caching, `MemoryCache`, key derivation
  - SSR: `renderToStream()`, `serializeToHtml()`, `HeadCollector` for streaming HTML
  - Hydration: `hydrate()` with eager/lazy/interaction strategies, component registry
  - Router: `defineRoutes()`, `createRouter()`, `createLink()`, `createOutlet()`, search params
  - Primitives: 15 headless components (Button, Dialog, Select, Menu, Tabs, Accordion, etc.)
  - Testing: `renderTest()`, `findByText()`, `click()`, `type()`, `press()`, `createTestRouter()`
  - Vite plugin: HMR, CSS extraction, codegen watch mode
  - Curated public API: developer-facing exports in main barrel, compiler internals in `@vertz/ui/internals`

- Updated dependencies [[`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98), [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11), [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145), [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b), [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c), [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8), [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e), [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630)]:
  - @vertz/ui@0.2.0
