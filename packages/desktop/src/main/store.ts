import { app } from 'electron';
import {
  readConversationStore,
  writeConversationStore
} from './storage/conversation-store.js';

export * from './storage/types.js';
export * from './storage/paths.js';
export * from './storage/conversation-store.js';

/** Reads the full conversation store from the user-data directory. */
export function readStore() {
  return readConversationStore(app.getPath('userData'));
}

/** Writes the full conversation store to the user-data directory. */
export function writeStore(data: Parameters<typeof writeConversationStore>[0]): void {
  writeConversationStore(data, app.getPath('userData'));
}
