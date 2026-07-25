# Bug Finding: Stale Chat Timestamps Displaying as "1m ago"

## Description
Chats created in SuperAgent Desktop were showing `"1m"` ago in the sidebar even if they last responded yesterday or earlier. 

## Technical Root Cause
1. **Initial Timestamp Stuck as String**: When a chat was created, its `timestamp` field was set to the literal string `'Just now'` (in `ChatRepository.ts`, `conversation.ts`, and `AgentOrchestrator.ts`).
2. **Missing Timestamp Updates**: When subsequent prompts were sent or responses were completed, the `timestamp` field of the chat record in the Zustand store was never updated. Thus, `'Just now'` was persisted to `chat.json` on disk.
3. **Parse Logic Evaluates "Just now" to Now**: Upon app reload, `parseChatTime` converted the string `'Just now'` to `Date.now()`. The difference `Date.now() - Date.now()` yielded `0`, which formatting evaluated as `'1m'`.
4. **State Sync Omission**: The React-to-Zustand sync loop in `App.tsx` did not compare `timestamp`, `isRunning`, or `startedAt` fields when checking for updates. This blocked UI updates for these fields even if they had changed.

## Severity
- **Severity**: Low (UX/UI defect)

## Reproduction Steps
1. Create a new chat in the Desktop UI. It is initialized with the `"Just now"` timestamp.
2. Send messages and complete the session.
3. Exit the application.
4. Wait for several hours or a day.
5. Re-open the application.
6. Observe that the chat in the sidebar still displays `"1m"` ago instead of `"17h"` or `"1d"`.

## Remediation / Fixes Applied
- **Mtime Fallback for Legacy Chats**: Modified [conversation-store.ts](file:///d:/Project/OpenSource/AgentApp/packages/core/src/storage/conversation-store.ts) to automatically fall back to the `chat.json` file's last modified time (`mtime`) if the loaded timestamp is missing, invalid, or `"Just now"`. This immediately fixes all pre-existing chats.
- **Valid ISO Timestamps on Creation**: Updated chat creation helpers in [ChatRepository.ts](file:///d:/Project/OpenSource/AgentApp/packages/desktop/src/renderer/services/ChatRepository.ts), [conversation.ts](file:///d:/Project/OpenSource/AgentApp/packages/desktop/src/renderer/logic/conversation.ts), and [AgentOrchestrator.ts](file:///d:/Project/OpenSource/AgentApp/packages/desktop/src/renderer/services/AgentOrchestrator.ts) to initialize `timestamp` to `new Date().toISOString()`.
- **Dynamic Updates on Run start/stop**: Updated the prompt submission and termination handlers in [AgentOrchestrator.ts](file:///d:/Project/OpenSource/AgentApp/packages/desktop/src/renderer/services/AgentOrchestrator.ts), [agent.ts](file:///d:/Project/OpenSource/AgentApp/packages/desktop/src/renderer/logic/agent.ts), and [agentStream.ts](file:///d:/Project/OpenSource/AgentApp/packages/desktop/src/renderer/logic/agentStream.ts) to update `timestamp`, `isRunning`, and `startedAt` on the chat record.
- **Sync Loop Comparison Update**: Updated [App.tsx](file:///d:/Project/OpenSource/AgentApp/packages/desktop/src/renderer/App.tsx)'s Zustand store subscription to compare `timestamp`, `isRunning`, and `startedAt`, ensuring immediate UI re-renders.
