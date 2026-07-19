import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownStream } from './MarkdownStream.js';
import type { ImageAttachment } from '@superagent/core';

/** A single tool invocation recorded during an assistant turn. */
export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

/** A chat message as rendered by the TUI (superset of the previous ChatMessage). */
export interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  attachments?: ImageAttachment[];
  tools?: ToolCallInfo[];
  elapsedMs?: number;
}

function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args || {}).map(([k, v]) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return `${k}=${s.length > 60 ? s.slice(0, 57) + '…' : s}`;
  });
  return parts.join(' ');
}

/** Renders one chat message in the Claude-Code style: `❯` for user turns, an
 *  indented markdown body for assistant turns, tool-call lines, and a footer. */
export const MessageView: React.FC<{ message: UiMessage }> = ({ message }) => {
  const m = message;

  if (m.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="green">
            {'❯ '}
          </Text>
          <Text>{m.content}</Text>
        </Box>
        {m.attachments && m.attachments.length > 0 && (
          <Text dimColor color="gray">
            {'  '}📎 {m.attachments.map((a) => a.path.split(/[\\/]/).pop()).join(', ')}
          </Text>
        )}
      </Box>
    );
  }

  if (m.role === 'system') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="yellow" dimColor>
          {m.content}
        </Text>
      </Box>
    );
  }

  // assistant
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box paddingLeft={2} flexDirection="column">
        {m.tools && m.tools.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {m.tools.map((t, i) => (
              <Box key={i} flexDirection="column">
                <Text color="magenta" dimColor>
                  {'⟢ '}
                  {t.name}
                  {Object.keys(t.args || {}).length > 0 ? `(${formatArgs(t.args)})` : ''}
                </Text>
                {t.result && (
                  <Text color="gray" dimColor>
                    {'    '}
                    {t.result.length > 200 ? t.result.slice(0, 197) + '…' : t.result}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
        {m.content.length > 0 ? (
          <MarkdownStream content={m.content} isStreaming={m.isStreaming} />
        ) : (
          m.isStreaming && (
            <Text color="blue" dimColor>
              Thinking…
            </Text>
          )
        )}
      </Box>
      {!m.isStreaming && m.elapsedMs !== undefined && (
        <Text color="gray" dimColor>
          {'  '}✻ worked for {Math.max(1, Math.round(m.elapsedMs / 1000))}s
        </Text>
      )}
    </Box>
  );
};
