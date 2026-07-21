import { getUserDataDirectory } from '@superagent/core';
import {
  readConversationStore,
  writeConversationStore
} from './storage/conversation-store.js';

export * from './storage/types.js';
export * from './storage/paths.js';
export * from './storage/conversation-store.js';

/** Reads the full conversation store from the user-data directory. */
export async function readStore() {
  return readConversationStore(getUserDataDirectory());
}

/** Writes the full conversation store to the user-data directory. */
export async function writeStore(data: Parameters<typeof writeConversationStore>[0]): Promise<void> {
  await writeConversationStore(data, getUserDataDirectory());
}
