# @cvr/herdr-hunk

## 0.1.0

### Minor Changes

- [`56b389c`](https://github.com/cevr/herdr-hunk/commit/56b389c7b4f76b57cfafd16b308008baeb0b366a) Thanks [@cevr](https://github.com/cevr)! - Add the first Herdr and Hunk review bridge.

- [`15c0fae`](https://github.com/cevr/herdr-hunk/commit/15c0faeaa601d9b027dd01695bc92013b424cd12) Thanks [@cevr](https://github.com/cevr)! - Refresh the open Hunk diff when the source agent changes the worktree.

### Patch Changes

- [`281d188`](https://github.com/cevr/herdr-hunk/commit/281d1888c9330b0270fe913d9cb4064aef6da974) Thanks [@cevr](https://github.com/cevr)! - Accept null pane and workspace fields from Herdr and fail with a clear bridge error.

- [`4081bae`](https://github.com/cevr/herdr-hunk/commit/4081baeed3a18f80b11ddc84072e4ad04dac305c) Thanks [@cevr](https://github.com/cevr)! - Run the typecheck script through the Effect-patched `tsc` binary. The `tsgo` bin is never patched, so Effect diagnostics were silently skipped. Fix the Effect diagnostics this uncovered.
