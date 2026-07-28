import { Schema } from 'effect';

export class BridgeError extends Schema.TaggedErrorClass<BridgeError>()(
  '@cvr/herdr-hunk/BridgeError',
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}
