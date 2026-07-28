import { Context, Effect, Layer, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { BridgeError } from '../domain/errors.js';
import type { ReviewOrigin, ReviewRoute } from '../domain/review.js';

const processError = (operation: string, cause: unknown): BridgeError =>
  new BridgeError({
    operation,
    message: `${operation} failed: ${String(cause)}`,
  });

const PluginPaneOpenResponse = Schema.Struct({
  result: Schema.Struct({
    type: Schema.Literal('plugin_pane_opened'),
    plugin_pane: Schema.Struct({
      pane: Schema.Struct({
        pane_id: Schema.String,
      }),
    }),
  }),
});

const PaneInfoResponse = Schema.Struct({
  result: Schema.Struct({
    type: Schema.Literal('pane_info'),
    pane: Schema.Struct({
      tokens: Schema.Record(Schema.String, Schema.String),
    }),
  }),
});

const PaneProcessInfoResponse = Schema.Struct({
  result: Schema.Struct({
    type: Schema.Literal('pane_process_info'),
    process_info: Schema.Struct({
      shell_pid: Schema.Number,
    }),
  }),
});

const decodePluginPaneOpenResponse = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PluginPaneOpenResponse),
);
const decodePaneInfoResponse = Schema.decodeUnknownEffect(Schema.fromJsonString(PaneInfoResponse));
const decodePaneProcessInfoResponse = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PaneProcessInfoResponse),
);

export interface HerdrAdapterShape {
  readonly openReviewTab: (origin: ReviewOrigin) => Effect.Effect<void, BridgeError>;
  readonly findReviewRoute: (reviewPaneId: string) => Effect.Effect<ReviewRoute, BridgeError>;
  readonly sendText: (paneId: string, text: string) => Effect.Effect<void, BridgeError>;
}

export class HerdrAdapter extends Context.Service<HerdrAdapter, HerdrAdapterShape>()(
  '@cvr/herdr-hunk/HerdrAdapter',
) {
  static readonly layer = Layer.effect(
    HerdrAdapter,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const herdrExecutable = process.env['HERDR_BIN_PATH'] ?? 'herdr';

      const run = Effect.fn('HerdrAdapter.run')(function* (
        operation: string,
        args: ReadonlyArray<string>,
      ) {
        const exitCode = yield* spawner
          .exitCode(ChildProcess.make(herdrExecutable, args))
          .pipe(Effect.mapError((cause) => processError(operation, cause)));

        if (exitCode !== 0) {
          return yield* new BridgeError({
            operation,
            message: `${operation} exited with code ${exitCode}`,
          });
        }
      });

      const read = Effect.fn('HerdrAdapter.read')(function* (
        operation: string,
        args: ReadonlyArray<string>,
      ) {
        return yield* spawner
          .string(ChildProcess.make(herdrExecutable, args), {
            includeStderr: true,
          })
          .pipe(Effect.mapError((cause) => processError(operation, cause)));
      });

      return {
        openReviewTab: (origin) =>
          Effect.gen(function* () {
            const output = yield* read('Open Hunk tab', [
              'plugin',
              'pane',
              'open',
              '--plugin',
              'cvr.herdr-hunk',
              '--entrypoint',
              'review',
              '--placement',
              'tab',
              '--workspace',
              origin.workspaceId,
              '--cwd',
              origin.cwd,
              '--env',
              `HERDR_HUNK_CWD=${origin.cwd}`,
              '--focus',
            ]);
            const response = yield* decodePluginPaneOpenResponse(output).pipe(
              Effect.mapError((cause) => processError('Decode Hunk pane', cause)),
            );
            const reviewPaneId = response.result.plugin_pane.pane.pane_id;

            yield* run('Record source agent pane', [
              'pane',
              'report-metadata',
              reviewPaneId,
              '--source',
              'cvr.herdr-hunk',
              '--token',
              `origin_pane_id=${origin.paneId}`,
            ]);
          }),

        findReviewRoute: (reviewPaneId) =>
          Effect.gen(function* () {
            const [paneOutput, processOutput] = yield* Effect.all(
              [
                read('Read Hunk pane metadata', ['pane', 'get', reviewPaneId]),
                read('Read Hunk pane process', ['pane', 'process-info', '--pane', reviewPaneId]),
              ],
              { concurrency: 2 },
            );
            const paneResponse = yield* decodePaneInfoResponse(paneOutput).pipe(
              Effect.mapError((cause) => processError('Decode Hunk pane metadata', cause)),
            );
            const processResponse = yield* decodePaneProcessInfoResponse(processOutput).pipe(
              Effect.mapError((cause) => processError('Decode Hunk pane process', cause)),
            );
            const originPaneId = paneResponse.result.pane.tokens['origin_pane_id'];

            if (originPaneId === undefined) {
              return yield* new BridgeError({
                operation: 'Find source agent',
                message: 'This Hunk tab has no source agent pane.',
              });
            }

            return {
              originPaneId,
              processId: processResponse.result.process_info.shell_pid,
            };
          }),

        sendText: (paneId, text) => run('Send Hunk notes', ['pane', 'send-text', paneId, text]),
      };
    }),
  );

  static layerTest = (implementation: HerdrAdapterShape): Layer.Layer<HerdrAdapter> =>
    Layer.succeed(HerdrAdapter, implementation);
}
