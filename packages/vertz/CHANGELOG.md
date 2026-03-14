# vertz

## 0.2.16

### Patch Changes

- [#1173](https://github.com/vertz-dev/vertz/pull/1173) [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix package release correctness: vertz subpath exports now point to built dist artifacts instead of raw .ts source, Turbo test inputs include out-of-src test directories, and create-vertz-app exposes test/typecheck scripts

- Updated dependencies [[`15511ba`](https://github.com/vertz-dev/vertz/commit/15511ba68fe78c99ba7d056ef17db94d8380f9fa), [`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`2f574cc`](https://github.com/vertz-dev/vertz/commit/2f574cce9e941c63503efb2e32ecef7b53951725), [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`15511ba`](https://github.com/vertz-dev/vertz/commit/15511ba68fe78c99ba7d056ef17db94d8380f9fa), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`391096b`](https://github.com/vertz-dev/vertz/commit/391096b426e1debb6cee06b336768b0e20abc191), [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8), [`7de4b67`](https://github.com/vertz-dev/vertz/commit/7de4b67985065450262fa6f5a3acdc6b269f177e), [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`e1938b0`](https://github.com/vertz-dev/vertz/commit/e1938b0f86129396d22f5db57792cfa805387e62), [`8c707ca`](https://github.com/vertz-dev/vertz/commit/8c707ca055f965526b043567b93844343e7a51e8), [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61), [`9ea1dc0`](https://github.com/vertz-dev/vertz/commit/9ea1dc08a892918af7fbe5433293cf7c370f34f0), [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d), [`ab3f364`](https://github.com/vertz-dev/vertz/commit/ab3f36478018245cc9473217a9a3bf7b04c6a5cb), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc), [`c1c0638`](https://github.com/vertz-dev/vertz/commit/c1c06383b8ad50c833b64aa5009fe7b494bb559b), [`5dfaebc`](https://github.com/vertz-dev/vertz/commit/5dfaebc83853922f08120c2b5e56af7998752a00), [`667453b`](https://github.com/vertz-dev/vertz/commit/667453bb8011aecaba4cbc79b816409cc8cbc744), [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb)]:
  - @vertz/server@0.2.16
  - @vertz/ui@0.2.16
  - @vertz/ui-server@0.2.16
  - @vertz/db@0.2.16
  - @vertz/cloudflare@0.2.16
  - @vertz/ui-primitives@0.2.16
  - @vertz/ui-compiler@0.2.16
  - @vertz/fetch@0.2.16
  - @vertz/errors@0.2.16
  - @vertz/schema@0.2.16
  - @vertz/testing@0.2.16
  - @vertz/tui@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/server@0.2.15
  - @vertz/ui@0.2.15
  - @vertz/cloudflare@0.2.15
  - @vertz/db@0.2.15
  - @vertz/errors@0.2.15
  - @vertz/fetch@0.2.15
  - @vertz/schema@0.2.15
  - @vertz/testing@0.2.15
  - @vertz/tui@0.2.15
  - @vertz/ui-compiler@0.2.15
  - @vertz/ui-primitives@0.2.15
  - @vertz/ui-server@0.2.15

## 0.2.14

### Patch Changes

- [#1089](https://github.com/vertz-dev/vertz/pull/1089) [`3254588`](https://github.com/vertz-dev/vertz/commit/3254588a2cfb3590eebda53a4648256cc4d51139) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Use `vertz` meta-package in scaffolded apps and add missing subpath exports (`db/sqlite`, `ui-server/bun-plugin`, `theme-shadcn`). Compiler now recognizes `vertz/*` imports alongside `@vertz/*`.

- Updated dependencies []:
  - @vertz/cloudflare@0.2.14
  - @vertz/db@0.2.14
  - @vertz/errors@0.2.14
  - @vertz/fetch@0.2.14
  - @vertz/schema@0.2.14
  - @vertz/server@0.2.14
  - @vertz/testing@0.2.14
  - @vertz/tui@0.2.14
  - @vertz/ui@0.2.14
  - @vertz/ui-compiler@0.2.14
  - @vertz/ui-primitives@0.2.14
  - @vertz/ui-server@0.2.14

## 0.2.13

### Patch Changes

- [#961](https://github.com/vertz-dev/vertz/pull/961) [`4bcfa46`](https://github.com/vertz-dev/vertz/commit/4bcfa46b97623c8d42b174cf3ac3d627c4ef3491) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz/ui-server` subpath export to meta package

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`2f6d58a`](https://github.com/vertz-dev/vertz/commit/2f6d58a818d0ecbbd7999b0bfc072e2424640f59), [`127df59`](https://github.com/vertz-dev/vertz/commit/127df59424102142ac1aee9dfcc31b22c2959343), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`58fffce`](https://github.com/vertz-dev/vertz/commit/58fffceb6c4e1660fb3d4d1891cd4ce662dca22b), [`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`a9211ca`](https://github.com/vertz-dev/vertz/commit/a9211ca751305f541987b93d493d349838cf4822), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344), [`d4af7d0`](https://github.com/vertz-dev/vertz/commit/d4af7d0fa0ff1f3cfc21625e9bd16621f833f9cd), [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211), [`45e84cf`](https://github.com/vertz-dev/vertz/commit/45e84cf2f11123bf3ed66ae8cf311efc1393238c), [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05), [`eab229b`](https://github.com/vertz-dev/vertz/commit/eab229bc63a08ae6877ff4905d99c364a8694358)]:
  - @vertz/server@0.2.13
  - @vertz/ui@0.2.13
  - @vertz/ui-compiler@0.2.13
  - @vertz/ui-server@0.2.13
  - @vertz/db@0.2.13
  - @vertz/fetch@0.2.13
  - @vertz/errors@0.2.13
  - @vertz/cloudflare@0.2.13
  - @vertz/schema@0.2.13
  - @vertz/testing@0.2.13
  - @vertz/tui@0.2.13
  - @vertz/ui-primitives@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui@0.2.12
  - @vertz/cloudflare@0.2.12
  - @vertz/db@0.2.12
  - @vertz/errors@0.2.12
  - @vertz/fetch@0.2.12
  - @vertz/schema@0.2.12
  - @vertz/server@0.2.12
  - @vertz/testing@0.2.12
  - @vertz/tui@0.2.12
  - @vertz/ui-compiler@0.2.12
  - @vertz/ui-primitives@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies [[`275e4c7`](https://github.com/vertz-dev/vertz/commit/275e4c770f55b9e75b44d90f2cb586fff3eaeede), [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4), [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a), [`523bbcb`](https://github.com/vertz-dev/vertz/commit/523bbcb12c1866a8334d5dac278cb51b157a5c7b), [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a), [`859e3da`](https://github.com/vertz-dev/vertz/commit/859e3dae660629d5d4f1e13c305c9201ee1d738d)]:
  - @vertz/ui-compiler@0.2.11
  - @vertz/ui@0.2.11
  - @vertz/cloudflare@0.2.11
  - @vertz/db@0.2.11
  - @vertz/errors@0.2.11
  - @vertz/fetch@0.2.11
  - @vertz/schema@0.2.11
  - @vertz/server@0.2.11
  - @vertz/testing@0.2.11
  - @vertz/tui@0.2.11
  - @vertz/ui-primitives@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/cloudflare@0.2.8
  - @vertz/db@0.2.8
  - @vertz/errors@0.2.8
  - @vertz/fetch@0.2.8
  - @vertz/schema@0.2.8
  - @vertz/server@0.2.8
  - @vertz/testing@0.2.8
  - @vertz/tui@0.2.8
  - @vertz/ui@0.2.8
  - @vertz/ui-compiler@0.2.8
  - @vertz/ui-primitives@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/cloudflare@0.2.7
  - @vertz/db@0.2.7
  - @vertz/errors@0.2.7
  - @vertz/fetch@0.2.7
  - @vertz/schema@0.2.7
  - @vertz/server@0.2.7
  - @vertz/testing@0.2.7
  - @vertz/tui@0.2.7
  - @vertz/ui@0.2.7
  - @vertz/ui-compiler@0.2.7
  - @vertz/ui-primitives@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/cloudflare@0.2.6
  - @vertz/db@0.2.6
  - @vertz/errors@0.2.6
  - @vertz/fetch@0.2.6
  - @vertz/schema@0.2.6
  - @vertz/server@0.2.6
  - @vertz/testing@0.2.6
  - @vertz/tui@0.2.6
  - @vertz/ui@0.2.6
  - @vertz/ui-compiler@0.2.6
  - @vertz/ui-primitives@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/cloudflare@0.2.5
  - @vertz/db@0.2.5
  - @vertz/errors@0.2.5
  - @vertz/fetch@0.2.5
  - @vertz/schema@0.2.5
  - @vertz/server@0.2.5
  - @vertz/testing@0.2.5
  - @vertz/tui@0.2.5
  - @vertz/ui@0.2.5
  - @vertz/ui-compiler@0.2.5
  - @vertz/ui-primitives@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [[`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c)]:
  - @vertz/ui-compiler@0.2.4
  - @vertz/ui-primitives@0.2.2
  - @vertz/cloudflare@0.2.4
  - @vertz/schema@0.2.4
  - @vertz/testing@0.2.4
  - @vertz/db@0.2.4
  - @vertz/ui@0.2.2
  - @vertz/server@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c)]:
  - @vertz/tui@0.2.3
  - @vertz/ui-compiler@0.2.3
  - @vertz/server@0.2.3
  - @vertz/testing@0.2.3
  - @vertz/cloudflare@0.2.3
  - @vertz/ui-primitives@0.2.2
  - @vertz/schema@0.2.3
  - @vertz/db@0.2.3
  - @vertz/ui@0.2.2

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/server@0.2.2
  - @vertz/ui@0.2.2
  - @vertz/schema@0.2.2
  - @vertz/testing@0.2.2
  - @vertz/tui@0.2.2
  - @vertz/ui-compiler@0.2.2
  - @vertz/ui-primitives@0.2.2
  - @vertz/db@0.2.2
  - @vertz/cloudflare@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380), [`db53497`](https://github.com/vertz-dev/vertz/commit/db534979df714d51227a34b4d5b80960e34ec33c), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`2ec4dd3`](https://github.com/vertz-dev/vertz/commit/2ec4dd3be1ac13f74015e977a699cd59fd7291bc), [`259e250`](https://github.com/vertz-dev/vertz/commit/259e2501116f805fed49b95471aaeb4f80515256), [`6443339`](https://github.com/vertz-dev/vertz/commit/64433394142ddff76d8021b25259c9c901d62b1e), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06), [`f3b132a`](https://github.com/vertz-dev/vertz/commit/f3b132af4f6ff39e967d4ca3d33f7e6ee12eff84), [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b), [`c38def6`](https://github.com/vertz-dev/vertz/commit/c38def6b6e060f63afeaacd93afa85aae9154833), [`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98), [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11), [`6814cd8`](https://github.com/vertz-dev/vertz/commit/6814cd8da818cd0b36deaea132ca589cf6a03a89), [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145), [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b), [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c), [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8), [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e), [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630)]:
  - @vertz/server@0.2.0
  - @vertz/testing@0.2.0
  - @vertz/db@0.2.0
  - @vertz/schema@0.2.0
  - @vertz/ui-compiler@1.0.0
  - @vertz/ui@0.2.0
