import { describe, expect, it } from 'bun:test';
import { Effect } from 'effect';

import { ReviewBridge } from '../src/review-bridge.js';
import { BridgeError } from '../src/domain/errors.js';
import { type ReviewNote, ReviewOrigin, ReviewPaneContext } from '../src/domain/review.js';
import { HerdrAdapter } from '../src/services/herdr-adapter.js';
import { HunkAdapter } from '../src/services/hunk-adapter.js';

const origin = ReviewOrigin.make({
  workspaceId: 'workspace-1',
  paneId: 'workspace-1:pane-agent',
  cwd: '/project',
  agentLabel: 'Codex',
});

const note: ReviewNote = {
  noteId: 'note-1',
  source: 'user',
  filePath: 'src/main.ts',
  hunkIndex: 0,
  newRange: [42, 42],
  body: 'Keep this invariant.\nAdd a regression test.',
  createdAt: '2026-07-28T12:00:00.000Z',
  editable: true,
};

const noHunkEffects = HunkAdapter.layerTest({
  run: () => Effect.void,
  findSession: () => Effect.succeed('session-1'),
  listUserNotes: () => Effect.succeed([]),
  clearUserNotes: () => Effect.void,
});

const reviewPaneContext = ReviewPaneContext.make({
  paneId: 'workspace-1:pane-hunk',
  cwd: '/project',
});

describe('ReviewBridge', () => {
  it('opens the review for the exact source pane', async () => {
    const openedOrigins: Array<typeof origin> = [];
    const herdr = HerdrAdapter.layerTest({
      openReviewTab: (value) => Effect.sync(() => openedOrigins.push(value)),
      findReviewRoute: () =>
        Effect.succeed({
          originPaneId: origin.paneId,
          processId: 100,
        }),
      sendText: () => Effect.void,
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const bridge = yield* ReviewBridge;
        yield* bridge.open(origin);
      }).pipe(
        Effect.provide(ReviewBridge.layer),
        Effect.provide(herdr),
        Effect.provide(noHunkEffects),
      ),
    );

    expect(openedOrigins).toEqual([origin]);
  });

  it('sends notes to the source pane and clears them after delivery', async () => {
    const deliveries: Array<{ paneId: string; text: string }> = [];
    let clearCount = 0;
    const herdr = HerdrAdapter.layerTest({
      openReviewTab: () => Effect.void,
      findReviewRoute: () =>
        Effect.succeed({
          originPaneId: origin.paneId,
          processId: 100,
        }),
      sendText: (paneId, text) =>
        Effect.sync(() => {
          deliveries.push({ paneId, text });
        }),
    });
    const hunk = HunkAdapter.layerTest({
      run: () => Effect.void,
      findSession: () => Effect.succeed('session-1'),
      listUserNotes: () => Effect.succeed([note]),
      clearUserNotes: () =>
        Effect.sync(() => {
          clearCount += 1;
        }),
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const bridge = yield* ReviewBridge;
        yield* bridge.send(reviewPaneContext);
      }).pipe(Effect.provide(ReviewBridge.layer), Effect.provide(herdr), Effect.provide(hunk)),
    );

    expect(deliveries).toEqual([
      {
        paneId: 'workspace-1:pane-agent',
        text: 'Review notes from Hunk: [src/main.ts:42 new] Keep this invariant. Add a regression test. Please address these notes. Keep unrelated code unchanged.',
      },
    ]);
    expect(clearCount).toBe(1);
  });

  it('rejects an empty review before delivery', async () => {
    let sendCount = 0;
    const herdr = HerdrAdapter.layerTest({
      openReviewTab: () => Effect.void,
      findReviewRoute: () =>
        Effect.succeed({
          originPaneId: origin.paneId,
          processId: 100,
        }),
      sendText: () =>
        Effect.sync(() => {
          sendCount += 1;
        }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const bridge = yield* ReviewBridge;
        return yield* bridge.send(reviewPaneContext).pipe(Effect.flip);
      }).pipe(
        Effect.provide(ReviewBridge.layer),
        Effect.provide(herdr),
        Effect.provide(noHunkEffects),
      ),
    );

    expect(result.message).toContain('Save at least one Hunk note');
    expect(sendCount).toBe(0);
  });

  it('keeps notes when delivery fails', async () => {
    let clearCount = 0;
    const herdr = HerdrAdapter.layerTest({
      openReviewTab: () => Effect.void,
      findReviewRoute: () =>
        Effect.succeed({
          originPaneId: origin.paneId,
          processId: 100,
        }),
      sendText: () =>
        Effect.fail(
          new BridgeError({
            operation: 'Send Hunk notes',
            message: 'The source agent pane closed.',
          }),
        ),
    });
    const hunk = HunkAdapter.layerTest({
      run: () => Effect.void,
      findSession: () => Effect.succeed('session-1'),
      listUserNotes: () => Effect.succeed([note]),
      clearUserNotes: () =>
        Effect.sync(() => {
          clearCount += 1;
        }),
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const bridge = yield* ReviewBridge;
        return yield* bridge.send(reviewPaneContext).pipe(Effect.flip);
      }).pipe(Effect.provide(ReviewBridge.layer), Effect.provide(herdr), Effect.provide(hunk)),
    );

    expect(clearCount).toBe(0);
  });
});
