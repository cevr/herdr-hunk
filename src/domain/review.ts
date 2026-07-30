import { Effect, Schema } from 'effect';

import { BridgeError } from './errors.js';

// Herdr sends null for these fields when no pane or workspace has focus.
export const PluginInvocationContext = Schema.Struct({
  workspace_id: Schema.NullOr(Schema.String),
  focused_pane_id: Schema.NullOr(Schema.String),
  focused_pane_cwd: Schema.NullOr(Schema.String),
  focused_pane_agent: Schema.optional(Schema.NullOr(Schema.String)),
});

export type PluginInvocationContext = typeof PluginInvocationContext.Type;

export const ReviewOrigin = Schema.Struct({
  workspaceId: Schema.String,
  paneId: Schema.String,
  cwd: Schema.String,
  agentLabel: Schema.optional(Schema.String),
});

export type ReviewOrigin = typeof ReviewOrigin.Type;

export const originFromPluginContext = (
  context: PluginInvocationContext,
): Effect.Effect<ReviewOrigin, BridgeError> => {
  const {
    workspace_id: workspaceId,
    focused_pane_id: paneId,
    focused_pane_cwd: cwd,
    focused_pane_agent: agentLabel,
  } = context;

  if (workspaceId === null) {
    return Effect.fail(
      new BridgeError({
        operation: 'Read Herdr context',
        message: 'There is no focused workspace.',
      }),
    );
  }
  if (paneId === null || cwd === null) {
    return Effect.fail(
      new BridgeError({
        operation: 'Read Herdr context',
        message: 'There is no focused pane.',
      }),
    );
  }
  if (agentLabel === undefined || agentLabel === null) {
    return Effect.succeed(ReviewOrigin.make({ workspaceId, paneId, cwd }));
  }

  return Effect.succeed(ReviewOrigin.make({ workspaceId, paneId, cwd, agentLabel }));
};

const LineRange = Schema.Tuple([Schema.Number, Schema.Number]);

export const ReviewNote = Schema.Struct({
  noteId: Schema.String,
  source: Schema.Literal('user'),
  filePath: Schema.String,
  hunkIndex: Schema.optional(Schema.Number),
  oldRange: Schema.optional(LineRange),
  newRange: Schema.optional(LineRange),
  body: Schema.String,
  createdAt: Schema.String,
  editable: Schema.Boolean,
});

export type ReviewNote = typeof ReviewNote.Type;

export const ReviewNoteList = Schema.Struct({
  comments: Schema.Array(ReviewNote),
});

export const ReviewPaneContext = Schema.Struct({
  paneId: Schema.String,
  cwd: Schema.String,
});

export type ReviewPaneContext = typeof ReviewPaneContext.Type;

export interface ReviewRoute {
  readonly originPaneId: string;
  readonly processId: number;
}

const formatNoteLine = (note: ReviewNote): string => {
  const lineNumber = note.newRange?.[0] ?? note.oldRange?.[0];
  if (lineNumber !== undefined) {
    return String(lineNumber);
  }
  if (note.hunkIndex === undefined) {
    return '?';
  }
  return `hunk ${note.hunkIndex + 1}`;
};

const formatNoteSide = (note: ReviewNote): string => {
  if (note.newRange === undefined) {
    return 'old';
  }
  return 'new';
};

export const formatReviewNotes = (notes: ReadonlyArray<ReviewNote>): string => {
  const formattedNotes = notes.map((note) => {
    const body = note.body.replaceAll(/\s+/g, ' ').trim();

    return `[${note.filePath}:${formatNoteLine(note)} ${formatNoteSide(note)}] ${body}`;
  });

  return `Review notes from Hunk: ${formattedNotes.join(' | ')} Please address these notes. Keep unrelated code unchanged.`;
};
