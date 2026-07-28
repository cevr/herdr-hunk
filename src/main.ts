#!/usr/bin/env bun
/** @effect-diagnostics strictEffectProvide:off */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Console, Effect, Layer, Schema } from 'effect';
import { Command } from 'effect/unstable/cli';

import { ReviewBridge } from './review-bridge.js';
import { BridgeError } from './domain/errors.js';
import { PluginInvocationContext, ReviewOrigin, ReviewPaneContext } from './domain/review.js';
import { HerdrAdapter } from './services/herdr-adapter.js';
import { HunkAdapter } from './services/hunk-adapter.js';

declare const __VERSION__: string | undefined;

const version = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';

const readRequiredConfig = (key: string): Effect.Effect<string, BridgeError> =>
  Config.string(key).pipe(
    Effect.mapError(
      () =>
        new BridgeError({
          operation: 'Read environment',
          message: `${key} is required.`,
        }),
    ),
  );

const decodePluginContext = Effect.fn('decodePluginContext')(function* () {
  const contextJson = yield* readRequiredConfig('HERDR_PLUGIN_CONTEXT_JSON');
  const context = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PluginInvocationContext))(
    contextJson,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new BridgeError({
          operation: 'Read Herdr context',
          message: `The Herdr pane context is invalid: ${String(cause)}`,
        }),
    ),
  );

  return ReviewOrigin.make({
    workspaceId: context.workspace_id,
    paneId: context.focused_pane_id,
    cwd: context.focused_pane_cwd,
    ...(context.focused_pane_agent === undefined ? {} : { agentLabel: context.focused_pane_agent }),
  });
});

const openCommand = Command.make('open', {}, () =>
  Effect.gen(function* () {
    const bridge = yield* ReviewBridge;
    const origin = yield* decodePluginContext();
    yield* bridge.open(origin);
  }),
).pipe(Command.withDescription('Open Hunk in a new Herdr tab'));

const reviewCommand = Command.make('review', {}, () =>
  Effect.gen(function* () {
    const bridge = yield* ReviewBridge;
    const cwd = yield* readRequiredConfig('HERDR_HUNK_CWD');
    yield* bridge.run(cwd);
  }),
).pipe(Command.withDescription('Run the Hunk review pane'));

const sendCommand = Command.make('send', {}, () =>
  Effect.gen(function* () {
    const bridge = yield* ReviewBridge;
    const context = yield* decodePluginContext();
    yield* bridge.send(
      ReviewPaneContext.make({
        paneId: context.paneId,
        cwd: context.cwd,
      }),
    );
  }),
).pipe(Command.withDescription('Send saved Hunk notes to the source agent'));

const root = Command.make('herdr-hunk', {}, () => Effect.void).pipe(
  Command.withDescription('Bridge Hunk review notes to a Herdr agent'),
  Command.withSubcommands([openCommand, reviewCommand, sendCommand]),
);

const program = Command.run(root, { version }).pipe(
  Effect.tapCause((cause) =>
    Effect.gen(function* () {
      for (const reason of cause.reasons) {
        if (reason._tag !== 'Fail') {
          continue;
        }

        const error = reason.error;
        if (error instanceof BridgeError) {
          yield* Console.error(`${error.message}`);
        }
      }
    }),
  ),
);

const layer = ReviewBridge.layer.pipe(
  Layer.provide(HerdrAdapter.layer),
  Layer.provide(HunkAdapter.layer),
  Layer.provideMerge(BunServices.layer),
);

BunRuntime.runMain(program.pipe(Effect.provide(layer)), {
  disableErrorReporting: true,
});
