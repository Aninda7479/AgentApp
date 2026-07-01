import { app } from 'electron';
import {
  readConversationStore,
  writeConversationStore
} from './storage/conversation-store.js';

export * from './storage/types.js';
export * from './storage/paths.js';
export * from './storage/conversation-store.js';

export function readStore() {
  return readConversationStore(app.getPath('userData'));
}

export function writeStore(data: Parameters<typeof writeConversationStore>[0]): void {
  writeConversationStore(data, app.getPath('userData'));
}
