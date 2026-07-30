---
'@cvr/herdr-hunk': patch
---

Run the typecheck script through the Effect-patched `tsc` binary. The `tsgo` bin is never patched, so Effect diagnostics were silently skipped. Fix the Effect diagnostics this uncovered.
