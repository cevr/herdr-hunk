import { Context, Effect, Layer, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { BridgeError } from '../domain/errors.js';
import { ReviewNoteList, type ReviewNote } from '../domain/review.js';

const hunkError = (operation: string, cause: unknown): BridgeError =>
  new BridgeError({
    operation,
    message: `${operation} failed: ${String(cause)}`,
  });

const decodeReviewNoteList = Schema.decodeUnknownEffect(Schema.fromJsonString(ReviewNoteList));

const HunkSessionList = Schema.Struct({
  sessions: Schema.Array(
    Schema.Struct({
      sessionId: Schema.String,
      pid: Schema.Number,
      cwd: Schema.String,
    }),
  ),
});

const decodeHunkSessionList = Schema.decodeUnknownEffect(Schema.fromJsonString(HunkSessionList));

export interface HunkAdapterShape {
  readonly run: (cwd: string) => Effect.Effect<void, BridgeError>;
  readonly findSession: (
    cwd: string,
    parentProcessId: number,
  ) => Effect.Effect<string, BridgeError>;
  readonly listUserNotes: (
    sessionId: string,
  ) => Effect.Effect<ReadonlyArray<ReviewNote>, BridgeError>;
  readonly clearUserNotes: (sessionId: string) => Effect.Effect<void, BridgeError>;
}

export class HunkAdapter extends Context.Service<HunkAdapter, HunkAdapterShape>()(
  '@cvr/herdr-hunk/HunkAdapter',
) {
  static readonly layer = Layer.effect(
    HunkAdapter,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const read = Effect.fn('HunkAdapter.read')(function* (
        operation: string,
        args: ReadonlyArray<string>,
        cwd?: string,
      ) {
        return yield* spawner
          .string(ChildProcess.make('hunk', args, cwd === undefined ? {} : { cwd }), {
            includeStderr: true,
          })
          .pipe(Effect.mapError((cause) => hunkError(operation, cause)));
      });

      const hasAncestor = Effect.fn('HunkAdapter.hasAncestor')(function* (
        processId: number,
        ancestorProcessId: number,
      ) {
        let currentProcessId = processId;

        for (let depth = 0; depth < 16; depth += 1) {
          const output = yield* spawner
            .string(ChildProcess.make('ps', ['-o', 'ppid=', '-p', String(currentProcessId)]))
            .pipe(Effect.mapError((cause) => hunkError('Read Hunk process tree', cause)));
          const parentProcessId = Number.parseInt(output.trim(), 10);

          if (!Number.isSafeInteger(parentProcessId) || parentProcessId <= 0) {
            return false;
          }
          if (parentProcessId === ancestorProcessId) {
            return true;
          }

          currentProcessId = parentProcessId;
        }

        return false;
      });

      const run = Effect.fn('HunkAdapter.run')(function* (
        operation: string,
        args: ReadonlyArray<string>,
        cwd: string,
        inheritStdio = false,
      ) {
        const exitCode = yield* spawner
          .exitCode(
            ChildProcess.make('hunk', args, {
              cwd,
              detached: false,
              ...(inheritStdio
                ? {
                    stdin: 'inherit' as const,
                    stdout: 'inherit' as const,
                    stderr: 'inherit' as const,
                  }
                : {}),
            }),
          )
          .pipe(Effect.mapError((cause) => hunkError(operation, cause)));

        if (exitCode !== 0) {
          return yield* new BridgeError({
            operation,
            message: `${operation} exited with code ${exitCode}`,
          });
        }
      });

      return {
        run: (cwd) => run('Run Hunk', ['diff', '--watch'], cwd, true),

        findSession: (cwd, parentProcessId) =>
          Effect.gen(function* () {
            const output = yield* read('List Hunk sessions', ['session', 'list', '--json']);
            const sessionList = yield* decodeHunkSessionList(output).pipe(
              Effect.mapError((cause) => hunkError('Decode Hunk sessions', cause)),
            );
            const matchingSessions = sessionList.sessions.filter((session) => session.cwd === cwd);

            for (const session of matchingSessions) {
              if (yield* hasAncestor(session.pid, parentProcessId)) {
                return session.sessionId;
              }
            }

            return yield* new BridgeError({
              operation: 'Find Hunk session',
              message: 'No live Hunk session belongs to this Herdr pane.',
            });
          }),

        listUserNotes: (sessionId) =>
          Effect.gen(function* () {
            const output = yield* read('Read Hunk notes', [
              'session',
              'comment',
              'list',
              sessionId,
              '--type',
              'user',
              '--json',
            ]);

            const result = yield* decodeReviewNoteList(output).pipe(
              Effect.mapError((cause) => hunkError('Decode Hunk notes', cause)),
            );
            return result.comments;
          }),

        clearUserNotes: (sessionId) =>
          run(
            'Clear sent Hunk notes',
            ['session', 'comment', 'clear', sessionId, '--include-user', '--yes'],
            '.',
          ),
      };
    }),
  );

  static layerTest = (implementation: HunkAdapterShape): Layer.Layer<HunkAdapter> =>
    Layer.succeed(HunkAdapter, implementation);
}
