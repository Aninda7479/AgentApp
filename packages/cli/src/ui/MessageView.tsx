import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownStream } from './MarkdownStream.js';
import type { ImageAttachment } from '@superagent/core';
import { DiffReviewer } from '../commands/diff.js';

/** A single tool invocation recorded during an assistant turn. */
export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  originalContent?: string;
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

interface DiffChunk {
  lines: any[];
  startLine: number;
}

function groupDiffIntoChunks(diffLines: any[], contextSize = 3): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let currentChunk: any[] = [];
  let lastChangeIndex = -1;

  for (let i = 0; i < diffLines.length; i++) {
    const isChange = diffLines[i].type === 'add' || diffLines[i].type === 'delete';
    if (isChange) {
      lastChangeIndex = i;
    }
  }

  if (lastChangeIndex === -1) {
    return [];
  }

  let inChunk = false;
  let chunkStartIndex = 0;

  for (let i = 0; i < diffLines.length; i++) {
    let nearChange = false;
    for (let j = Math.max(0, i - contextSize); j <= Math.min(diffLines.length - 1, i + contextSize); j++) {
      if (diffLines[j].type === 'add' || diffLines[j].type === 'delete') {
        nearChange = true;
        break;
      }
    }

    if (nearChange) {
      if (!inChunk) {
        inChunk = true;
        chunkStartIndex = i;
        currentChunk = [];
      }
      currentChunk.push(diffLines[i]);
    } else {
      if (inChunk) {
        chunks.push({
          lines: currentChunk,
          startLine: chunkStartIndex + 1
        });
        currentChunk = [];
        inChunk = false;
      }
    }
  }

  if (inChunk && currentChunk.length > 0) {
    chunks.push({
      lines: currentChunk,
      startLine: chunkStartIndex + 1
    });
  }

  return chunks;
}

const FileDiffView: React.FC<{
  path: string;
  originalContent: string;
  modifiedContent: string;
}> = ({ path: filePath, originalContent, modifiedContent }) => {
  const diffLines = DiffReviewer.generateDiffLines(originalContent, modifiedContent);
  const addedCount = diffLines.filter(l => l.type === 'add').length;
  const removedCount = diffLines.filter(l => l.type === 'delete').length;
  const chunks = groupDiffIntoChunks(diffLines, 3);
  const isNew = !originalContent;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="cyan">
        {isNew ? `Create(${filePath})` : `Update(${filePath})`}
      </Text>
      <Text color="gray">
        L Added {addedCount} lines, removed {removedCount} lines
      </Text>
      <Box flexDirection="column" paddingLeft={2} marginTop={0}>
        {chunks.map((chunk, chunkIdx) => (
          <Box key={chunkIdx} flexDirection="column">
            {chunkIdx > 0 && (
              <Text color="gray" dimColor>
                {"  ···"}
              </Text>
            )}
            {chunk.lines.map((line, lineIdx) => {
              const lineNum = line.type === 'delete' ? line.oldLineNumber : line.newLineNumber;
              const lineNumStr = String(lineNum).padEnd(5, ' ');
              if (line.type === 'add') {
                return (
                  <Text key={lineIdx} color="green">
                    {lineNumStr}+ {line.content}
                  </Text>
                );
              } else if (line.type === 'delete') {
                return (
                  <Text key={lineIdx} color="red">
                    {lineNumStr}- {line.content}
                  </Text>
                );
              } else {
                return (
                  <Text key={lineIdx} color="gray" dimColor>
                    {lineNumStr}  {line.content}
                  </Text>
                );
              }
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

function getToolSummary(tools: ToolCallInfo[], elapsedMs?: number): string {
  const counts: Record<string, number> = {};
  for (const t of tools) {
    counts[t.name] = (counts[t.name] || 0) + 1;
  }

  const parts: string[] = [];
  if (elapsedMs !== undefined) {
    parts.push(`Thought for ${Math.max(1, Math.round(elapsedMs / 1000))}s`);
  }

  const nameMapping: Record<string, { singular: string; plural: string }> = {
    read_file: { singular: 'read 1 file', plural: 'read {n} files' },
    list_dir: { singular: 'listed 1 directory', plural: 'listed {n} directories' },
    grep_search: { singular: 'searched the codebase', plural: 'searched the codebase {n} times' },
    run_command: { singular: 'ran 1 shell command', plural: 'ran {n} shell commands' },
    write_file: { singular: 'wrote 1 file', plural: 'wrote {n} files' },
    web_fetch: { singular: 'fetched 1 web page', plural: 'fetched {n} web pages' },
    run_subagent: { singular: 'spawned 1 subagent', plural: 'spawned {n} subagents' },
  };

  for (const [name, count] of Object.entries(counts)) {
    const mapping = nameMapping[name];
    if (mapping) {
      if (count === 1) {
        parts.push(mapping.singular);
      } else {
        parts.push(mapping.plural.replace('{n}', String(count)));
      }
    } else {
      parts.push(count === 1 ? `called ${name} 1 time` : `called ${name} ${count} times`);
    }
  }

  if (parts.length === 0) return '';
  return parts.join(', ');
}

/** Renders one chat message in the Claude-Code style: `❯` for user turns, an
 *  indented markdown body for assistant turns, tool-call lines, and a footer. */
export const MessageView: React.FC<{ message: UiMessage }> = ({ message }) => {
  const m = message;

  if (m.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" backgroundColor="blue">
          {`❯ ${m.content}`}
        </Text>
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
  const hasTools = m.tools && m.tools.length > 0;
  const showSummary = !m.isStreaming && hasTools;
  const toolSummaryText = showSummary ? getToolSummary(m.tools!, m.elapsedMs) : '';

  const writeTools = hasTools && !m.isStreaming
    ? m.tools!.filter(t => t.name === 'write_file' && t.result && t.originalContent !== undefined)
    : [];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box paddingLeft={2} flexDirection="column">
        {/* Render active tools during streaming */}
        {m.isStreaming && hasTools && (
          <Box flexDirection="column" marginBottom={1}>
            {m.tools!.map((t, i) => (
              <Box key={i} flexDirection="column">
                <Text color="magenta" dimColor>
                  {'⟢ Running: '}
                  {t.name}
                  {Object.keys(t.args || {}).length > 0 ? `(${formatArgs(t.args)})` : ''}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Render summary line when finished */}
        {showSummary && toolSummaryText.length > 0 && (
          <Box marginBottom={1}>
            <Text color="gray" dimColor>
              {'✻ '}
              {toolSummaryText}
            </Text>
          </Box>
        )}

        {/* Render assistant text response */}
        {m.content.length > 0 ? (
          <MarkdownStream content={m.content} isStreaming={m.isStreaming} />
        ) : (
          m.isStreaming && !hasTools && (
            <Text color="blue" dimColor>
              Thinking…
            </Text>
          )
        )}

        {/* Render file write diffs at the bottom of the message */}
        {writeTools.map((t, i) => (
          <FileDiffView
            key={`diff-${i}`}
            path={t.args.path as string}
            originalContent={t.originalContent!}
            modifiedContent={t.args.content as string || ''}
          />
        ))}
      </Box>
    </Box>
  );
};
