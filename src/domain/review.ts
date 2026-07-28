import { Schema } from 'effect';

export const PluginInvocationContext = Schema.Struct({
  workspace_id: Schema.String,
  focused_pane_id: Schema.String,
  focused_pane_cwd: Schema.String,
  focused_pane_agent: Schema.optional(Schema.String),
});

export type PluginInvocationContext = typeof PluginInvocationContext.Type;

export const ReviewOrigin = Schema.Struct({
  workspaceId: Schema.String,
  paneId: Schema.String,
  cwd: Schema.String,
  agentLabel: Schema.optional(Schema.String),
});

export type ReviewOrigin = typeof ReviewOrigin.Type;

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

export const formatReviewNotes = (notes: ReadonlyArray<ReviewNote>): string => {
  const formattedNotes = notes.map((note) => {
    const line =
      note.newRange?.[0] ??
      note.oldRange?.[0] ??
      (note.hunkIndex === undefined ? '?' : `hunk ${note.hunkIndex + 1}`);
    const side = note.newRange === undefined ? 'old' : 'new';
    const body = note.body.replaceAll(/\s+/g, ' ').trim();

    return `[${note.filePath}:${line} ${side}] ${body}`;
  });

  return `Review notes from Hunk: ${formattedNotes.join(' | ')} Please address these notes. Keep unrelated code unchanged.`;
};
