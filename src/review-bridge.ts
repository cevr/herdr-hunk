import { Context, Effect, Layer } from 'effect';

import { BridgeError } from './domain/errors.js';
import { formatReviewNotes, type ReviewOrigin, type ReviewPaneContext } from './domain/review.js';
import { HerdrAdapter } from './services/herdr-adapter.js';
import { HunkAdapter } from './services/hunk-adapter.js';

export interface ReviewBridgeShape {
  readonly open: (origin: ReviewOrigin) => Effect.Effect<void, BridgeError>;
  readonly run: (cwd: string) => Effect.Effect<void, BridgeError>;
  readonly send: (context: ReviewPaneContext) => Effect.Effect<void, BridgeError>;
}

export class ReviewBridge extends Context.Service<ReviewBridge, ReviewBridgeShape>()(
  '@cvr/herdr-hunk/ReviewBridge',
) {
  static readonly layer = Layer.effect(
    ReviewBridge,
    Effect.gen(function* () {
      const herdr = yield* HerdrAdapter;
      const hunk = yield* HunkAdapter;

      return {
        open: herdr.openReviewTab,
        run: hunk.run,
        send: (context) =>
          Effect.gen(function* () {
            const route = yield* herdr.findReviewRoute(context.paneId);
            const sessionId = yield* hunk.findSession(context.cwd, route.processId);
            const notes = yield* hunk.listUserNotes(sessionId);

            if (notes.length === 0) {
              return yield* new BridgeError({
                operation: 'Send Hunk notes',
                message: 'Save at least one Hunk note before you send.',
              });
            }

            yield* herdr.sendText(route.originPaneId, formatReviewNotes(notes));
            yield* hunk.clearUserNotes(sessionId);
          }),
      };
    }),
  );
}
