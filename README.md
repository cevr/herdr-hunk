# herdr-hunk

Review a worktree in Hunk. Send saved notes to the Herdr agent pane that opened
the review.

Hunk opens in a new Herdr tab. This layout works well on small remote screens.
The diff refreshes when the agent changes the worktree. The plugin stores the
source pane ID. It never broadcasts notes to other agents.

## Requirements

- Bun 1.3 or later
- Herdr 0.7.5 or later
- Hunk 0.17.6 or later

Install Hunk with Bun:

```sh
bun add --global hunkdiff
```

Install the Herdr plugin:

```sh
herdr plugin install cevr/herdr-hunk
```

Add this command to `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+h"
type = "plugin_action"
command = "cvr.herdr-hunk.open"
description = "open Hunk review"

[[keys.command]]
key = "prefix+s"
type = "plugin_action"
command = "cvr.herdr-hunk.send"
description = "send Hunk notes"
```

Press `Ctrl+B`, then `H` in Herdr. Save review notes in Hunk. Press
`Ctrl+B`, then `S` to insert the notes into the source agent pane.

The plugin inserts one single-line prompt. It does not send Enter or other
control characters. Review the prompt before you submit it. The plugin clears
Hunk notes only after successful delivery.

## Development

```sh
bun install
bun run gate
herdr plugin link .
```

The package uses Effect 4 beta. It uses one review module and one Herdr adapter
seam. Tests replace the production adapter and use the same review interface as
the CLI.
